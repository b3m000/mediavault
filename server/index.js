import { spawn } from "node:child_process";
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { SERVER_PORT, normalizePath } from "./config.js";
import { getMimeType, isCoverImageExtension, isVideoExtension } from "./constants.js";
import { db, getNowIso } from "./db.js";
import { enqueueDownload, cancelDownload, copyToPendrive, listDownloads, removeFromPendrive } from "./download-service.js";
import {
  authenticateGoogleDrive,
  configureGoogleDriveFolders,
  disconnectGoogleDrive,
  getGoogleDriveStatus,
  streamDriveFile,
  syncGoogleDriveLibrary,
} from "./google-drive-service.js";
import {
  CONTENT_TYPES,
  formatDurationFromSeconds,
  resolveCategory,
  resolveContentType,
  resolveSourcePathForContent,
  resolveThumbnail,
} from "./library-classifier.js";
import { scanStorageSource } from "./scanner.js";
import {
  getDatabase,
  getStorageByType,
  getStorageSources,
  upsertStorageContentPaths,
  upsertStorageSource,
} from "./storage-service.js";

const app = express();
app.use(express.json());
const SUPPORTED_SUBTITLE_EXTENSIONS = new Set([".vtt"]);
const VALID_SCAN_TYPES = new Set(["all", "notebook", "pendrive"]);
const VALID_LOCAL_STORAGE_TYPES = new Set(["notebook", "pendrive"]);
const VALID_STORAGE_CLEAR_TYPES = new Set(["notebook", "pendrive", "google_drive"]);
const VALID_DOWNLOAD_DESTINATIONS = new Set(["notebook", "pendrive"]);

function clampPercentage(value) {
  return Math.max(0, Math.min(100, value));
}

function getMediaItemExists(mediaItemId) {
  return db.prepare("SELECT id FROM media_items WHERE id = ?").get(mediaItemId);
}

function isKnownContentType(contentType) {
  return CONTENT_TYPES.includes(contentType);
}

function getStorageContentPaths(source) {
  return {
    course: source.course_path ?? "",
    movie: source.movie_path ?? "",
    file: source.file_path ?? "",
  };
}

function mapStorageSourceForApi(source, usedBytes = 0) {
  const contentPaths = getStorageContentPaths(source);
  const isDriveSource = source.type === "google_drive";

  return {
    ...source,
    usedBytes,
    contentPaths,
    contentPathStatus: {
      course: isDriveSource ? Boolean(contentPaths.course) : Boolean(contentPaths.course && existsSync(contentPaths.course)),
      movie: isDriveSource ? Boolean(contentPaths.movie) : Boolean(contentPaths.movie && existsSync(contentPaths.movie)),
      file: isDriveSource ? Boolean(contentPaths.file) : Boolean(contentPaths.file && existsSync(contentPaths.file)),
    },
  };
}

function resolveBrowserCompatibility({ extension, mimeType }) {
  const normalizedExtension = String(extension ?? "").toLowerCase();
  const compatibilityText =
    "Este formato ou codec pode não ser totalmente suportado pelo navegador. Para melhor compatibilidade, use MP4 com vídeo H.264 e áudio AAC.";

  if (normalizedExtension === ".mp4" || normalizedExtension === ".m4v") {
    return {
      level: "high",
      message: "MP4 costuma ser o formato mais compatível no navegador quando usa vídeo H.264 e áudio AAC.",
      recommendedFormat: "MP4 com H.264/AAC",
    };
  }

  if (normalizedExtension === ".webm") {
    return {
      level: "medium",
      message: "WebM costuma funcionar em navegadores modernos, mas ainda depende dos codecs internos do arquivo.",
      recommendedFormat: "MP4 com H.264/AAC",
    };
  }

  if (normalizedExtension === ".mov") {
    return {
      level: "medium",
      message: "MOV pode abrir no navegador, mas depende dos codecs internos do arquivo.",
      recommendedFormat: "MP4 com H.264/AAC",
    };
  }

  return {
    level: "low",
    message: `${compatibilityText} MIME detectado: ${mimeType}. Se falhar no player do navegador, use a opção de abrir no player externo ou no Google Drive.`,
    recommendedFormat: "MP4 com H.264/AAC",
  };
}

function getCoverPathForRow(row) {
  const coverPath = normalizePath(row?.cover_path ?? "");
  return coverPath && existsSync(coverPath) ? coverPath : "";
}

function getThumbnailForRow(row, contentType) {
  const coverPath = getCoverPathForRow(row);
  if (coverPath) {
    const version = encodeURIComponent(row.updated_at ?? "");
    return `/api/library/${row.id}/cover${version ? `?v=${version}` : ""}`;
  }

  return resolveThumbnail(contentType);
}

function getPhysicalMediaPath(row) {
  const localPath = normalizePath(row?.local_file_path ?? "");
  if (localPath) {
    return localPath;
  }

  if (row?.storage_type === "google_drive") {
    return "";
  }

  return normalizePath(row?.file_path ?? "");
}

function getStorageClearRows(storageType) {
  return db
    .prepare(
      `
        SELECT id, title, file_name, file_path, local_file_path, storage_type, local_storage_type
        FROM media_items
        WHERE storage_type = ? OR local_storage_type = ?
      `,
    )
    .all(storageType, storageType);
}

function getPrimaryStorageRows(rows, storageType) {
  return rows.filter((row) => row.storage_type === storageType);
}

function getLocalCopyRows(rows, storageType) {
  return rows.filter((row) => row.storage_type !== storageType && row.local_storage_type === storageType);
}

function getStorageStatusAfterLocalCopyClear(storageType) {
  if (storageType === "google_drive") {
    return "available_drive";
  }

  if (storageType === "pendrive") {
    return "available_pendrive";
  }

  return "available_local";
}

function clearStorageCatalogRows({ primaryRows, localCopyRows }) {
  const nowIso = getNowIso();
  const deleteItem = db.prepare("DELETE FROM media_items WHERE id = ?");
  const clearLocalCopy = db.prepare(`
    UPDATE media_items
    SET
      local_file_path = NULL,
      local_storage_type = NULL,
      is_offline = 0,
      status = ?,
      updated_at = ?
    WHERE id = ?
  `);

  for (const row of primaryRows) {
    deleteItem.run(row.id);
  }

  for (const row of localCopyRows) {
    clearLocalCopy.run(getStorageStatusAfterLocalCopyClear(row.storage_type), nowIso, row.id);
  }
}

async function deleteIndexedStorageFiles({ rows, storageType }) {
  const deletedPaths = new Set();
  const successfulPrimaryRows = [];
  const successfulLocalCopyRows = [];
  const failed = [];
  let deletedFiles = 0;
  let missingFiles = 0;
  let skippedFiles = 0;

  for (const row of rows) {
    const isPrimaryStorageItem = row.storage_type === storageType;
    const targetPath = normalizePath(isPrimaryStorageItem ? row.file_path : row.local_file_path);

    if (!targetPath) {
      skippedFiles += 1;
      if (isPrimaryStorageItem) {
        successfulPrimaryRows.push(row);
      } else {
        successfulLocalCopyRows.push(row);
      }
      continue;
    }

    try {
      if (!existsSync(targetPath)) {
        missingFiles += 1;
      } else {
        const fileStats = statSync(targetPath);
        if (!fileStats.isFile()) {
          skippedFiles += 1;
        } else if (!deletedPaths.has(targetPath)) {
          await unlink(targetPath);
          deletedPaths.add(targetPath);
          deletedFiles += 1;
        }
      }

      if (isPrimaryStorageItem) {
        successfulPrimaryRows.push(row);
      } else {
        successfulLocalCopyRows.push(row);
      }
    } catch (error) {
      failed.push({
        id: row.id,
        title: row.title,
        fileName: row.file_name,
        path: targetPath,
        message: error instanceof Error ? error.message : "Falha ao apagar arquivo.",
      });
    }
  }

  return {
    primaryRows: successfulPrimaryRows,
    localCopyRows: successfulLocalCopyRows,
    deletedFiles,
    missingFiles,
    skippedFiles,
    failed,
  };
}

function normalizeOptionalText(value, maxLength = 120) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeOptionalInteger(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOptionalDate(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return undefined;
  }

  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    return undefined;
  }

  return normalized;
}

function toTitleCase(value) {
  return value
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeSubtitleLanguage(rawValue) {
  const cleaned = String(rawValue ?? "").trim();
  if (!cleaned) {
    return { lang: "pt-BR", label: "Português (BR)" };
  }

  const lower = cleaned.toLowerCase();
  if (lower === "pt" || lower === "ptbr" || lower === "pt-br") {
    return { lang: "pt-BR", label: "Português (BR)" };
  }

  if (lower === "en" || lower === "en-us" || lower === "en-gb") {
    return { lang: "en", label: "English" };
  }

  return {
    lang: cleaned,
    label: toTitleCase(cleaned),
  };
}

function isUsableSubtitlePath(subtitlePath) {
  return Boolean(subtitlePath) && path.extname(subtitlePath).toLowerCase() === ".vtt" && existsSync(subtitlePath);
}

function resolveSubtitleTracks(filePath, mediaItemId, subtitlePath) {
  const mediaDirectory = path.dirname(filePath);
  const mediaBaseName = path.basename(filePath, path.extname(filePath));
  let entries = [];

  try {
    entries = readdirSync(mediaDirectory, { withFileTypes: true });
  } catch {
    return [];
  }

  const manualSubtitlePath = normalizePath(subtitlePath);
  const manualTrack = isUsableSubtitlePath(manualSubtitlePath)
    ? {
        id: `${mediaItemId}-manual`,
        label: "Legenda associada",
        lang: "pt-BR",
        kind: "subtitles",
        url: `/api/player/${mediaItemId}/subtitles/manual`,
        default: true,
      }
    : null;

  const autoTracks = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => {
      const extension = path.extname(fileName).toLowerCase();
      if (!SUPPORTED_SUBTITLE_EXTENSIONS.has(extension)) {
        return false;
      }

      return fileName === `${mediaBaseName}.vtt` || fileName.startsWith(`${mediaBaseName}.`);
    })
    .filter((fileName) => path.resolve(mediaDirectory, fileName) !== path.resolve(manualSubtitlePath || ""))
    .sort((a, b) => a.localeCompare(b))
    .map((fileName, index) => {
      const subtitleBaseName = path.basename(fileName, path.extname(fileName));
      const suffix = subtitleBaseName === mediaBaseName ? "" : subtitleBaseName.slice(mediaBaseName.length + 1);
      const language = normalizeSubtitleLanguage(suffix);

      return {
        id: `${mediaItemId}-auto-${manualTrack ? index + 1 : index}`,
        label: suffix ? language.label : "Legenda padrão",
        lang: suffix ? language.lang : "pt-BR",
        kind: "subtitles",
        url: `/api/player/${mediaItemId}/subtitles/${encodeURIComponent(fileName)}`,
        default: !manualTrack && index === 0,
      };
    });

  return manualTrack ? [manualTrack, ...autoTracks] : autoTracks;
}

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
});

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    data: {
      status: "ok",
      service: "mediavault-local-api",
      timestamp: new Date().toISOString(),
    },
  });
});

app.get("/api/storage", (_req, res) => {
  const sources = getStorageSources();
  const usageStatement = db.prepare(
    "SELECT COALESCE(SUM(size_bytes), 0) AS used_bytes FROM media_items WHERE source_id = ? AND status != 'missing'",
  );

  const data = sources.map((source) => mapStorageSourceForApi(source, usageStatement.get(source.id).used_bytes));

  res.json({ success: true, data });
});

app.post("/api/storage/notebook", (req, res) => {
  const sourcePath = req.body?.path;
  const name = req.body?.name ?? "Notebook Principal";
  const categoryPaths = req.body?.contentPaths ?? req.body?.paths;

  try {
    const source = upsertStorageSource({ type: "notebook", name, sourcePath, categoryPaths });
    res.json({ success: true, data: mapStorageSourceForApi(source) });
  } catch (error) {
    res.status(400).json({ success: false, error: { message: error.message } });
  }
});

app.post("/api/storage/pendrive", (req, res) => {
  const sourcePath = req.body?.path;
  const name = req.body?.name ?? "Pendrive";
  const categoryPaths = req.body?.contentPaths ?? req.body?.paths;

  try {
    const source = upsertStorageSource({ type: "pendrive", name, sourcePath, categoryPaths });
    res.json({ success: true, data: mapStorageSourceForApi(source) });
  } catch (error) {
    res.status(400).json({ success: false, error: { message: error.message } });
  }
});

app.post("/api/storage/:type/paths", (req, res) => {
  const type = req.params.type;
  const categoryPaths = req.body?.contentPaths ?? req.body?.paths;

  if (!VALID_LOCAL_STORAGE_TYPES.has(type)) {
    res.status(400).json({ success: false, error: { message: "Tipo de armazenamento local inválido." } });
    return;
  }

  try {
    const source = upsertStorageContentPaths({ type, categoryPaths });
    res.json({ success: true, data: mapStorageSourceForApi(source) });
  } catch (error) {
    res.status(400).json({ success: false, error: { message: error.message } });
  }
});

app.post("/api/storage/scan", async (req, res) => {
  const targetType = req.body?.type ?? "all";

  if (!VALID_SCAN_TYPES.has(targetType)) {
    res.status(400).json({ success: false, error: { message: "Tipo de escaneamento inválido." } });
    return;
  }

  const scanTypes = targetType === "all" ? ["notebook", "pendrive"] : [targetType];

  const results = [];

  for (const type of scanTypes) {
    const source = getStorageByType(type);
    if (!source) {
      continue;
    }

    const isConnected = source.status === "active" || source.status === "connected";
    const canScan = isConnected;

    if (!canScan) {
      results.push({
        sourceType: source.type,
        sourcePath: source.path,
        skipped: true,
        reason: "source_disconnected",
      });
      continue;
    }

    try {
      const report = await scanStorageSource({ db: getDatabase(), source });
      results.push(report);
    } catch (error) {
      results.push({
        sourceType: source.type,
        sourcePath: source.path,
        skipped: true,
        reason: "scan_failed",
        detail: error.message,
      });
    }
  }

  res.json({ success: true, data: results });
});

app.delete("/api/storage/:type/content", async (req, res) => {
  const storageType = req.params.type;
  const deleteFiles = Boolean(req.body?.deleteFiles);
  const expectedConfirmation = deleteFiles ? "APAGAR ARQUIVOS" : "LIMPAR";
  const confirmation = String(req.body?.confirmText ?? "").trim().toUpperCase();

  if (!VALID_STORAGE_CLEAR_TYPES.has(storageType)) {
    res.status(400).json({ success: false, error: { message: "Tipo de armazenamento invalido." } });
    return;
  }

  if (deleteFiles && storageType === "google_drive") {
    res.status(400).json({
      success: false,
      error: { message: "Exclusao fisica do Google Drive ainda nao esta implementada." },
    });
    return;
  }

  if (confirmation !== expectedConfirmation) {
    res.status(400).json({
      success: false,
      error: { message: `Confirmacao invalida. Digite ${expectedConfirmation} para continuar.` },
    });
    return;
  }

  try {
    const rows = getStorageClearRows(storageType);
    let primaryRows = getPrimaryStorageRows(rows, storageType);
    let localCopyRows = getLocalCopyRows(rows, storageType);
    let deletedFiles = 0;
    let missingFiles = 0;
    let skippedFiles = 0;
    let failed = [];

    if (deleteFiles) {
      const deletionReport = await deleteIndexedStorageFiles({ rows: [...primaryRows, ...localCopyRows], storageType });
      primaryRows = deletionReport.primaryRows;
      localCopyRows = deletionReport.localCopyRows;
      deletedFiles = deletionReport.deletedFiles;
      missingFiles = deletionReport.missingFiles;
      skippedFiles = deletionReport.skippedFiles;
      failed = deletionReport.failed;
    }

    clearStorageCatalogRows({ primaryRows, localCopyRows });

    res.json({
      success: true,
      data: {
        storageType,
        mode: deleteFiles ? "delete_files" : "library_only",
        requestedItems: rows.length,
        removedFromLibrary: primaryRows.length,
        offlineCopiesCleared: localCopyRows.length,
        deletedFiles,
        missingFiles,
        skippedFiles,
        failedFiles: failed,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: error instanceof Error ? error.message : "Falha ao limpar armazenamento." },
    });
  }
});

app.get("/api/drive/status", (_req, res) => {
  res.json({ success: true, data: getGoogleDriveStatus() });
});

app.post("/api/drive/auth", async (_req, res) => {
  try {
    const status = await authenticateGoogleDrive();
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(400).json({ success: false, error: { message: error.message } });
  }
});

app.post("/api/drive/disconnect", async (_req, res) => {
  try {
    const status = await disconnectGoogleDrive();
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(400).json({ success: false, error: { message: error.message } });
  }
});

app.put("/api/drive/folders", (req, res) => {
  try {
    const status = configureGoogleDriveFolders(req.body?.folders ?? req.body?.contentPaths ?? req.body);
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(400).json({ success: false, error: { message: error.message } });
  }
});

app.post("/api/drive/sync", async (_req, res) => {
  try {
    const report = await syncGoogleDriveLibrary();
    res.json({ success: true, data: report });
  } catch (error) {
    res.status(400).json({ success: false, error: { message: error.message } });
  }
});

function mapLibraryRow(row) {
  const source = {
    path: row.source_path ?? "",
    course_path: row.course_path ?? "",
    movie_path: row.movie_path ?? "",
    file_path: row.category_file_path ?? "",
  };
  const contentType = resolveContentType({
    extension: row.extension,
    filePath: row.file_path,
    sourcePath: row.source_path ?? "",
    source,
  });
  const persistedContentType = isKnownContentType(row.content_type) ? row.content_type : contentType;
  const itemSourcePath = resolveSourcePathForContent({
    filePath: row.file_path,
    source,
    contentType: persistedContentType,
  });
  const category =
    row.storage_type === "google_drive"
      ? persistedContentType === "course"
        ? "Cursos"
        : persistedContentType === "movie"
          ? "Filmes"
          : "Arquivos"
      : resolveCategory({
          filePath: row.file_path,
          sourcePath: itemSourcePath,
          extension: row.extension,
          contentType: persistedContentType,
        });

  return {
    id: row.id,
    title: row.title,
    description: `${row.storage_type === "google_drive" ? "Arquivo no Google Drive" : "Arquivo local"}: ${row.file_name}`,
    thumbnail: getThumbnailForRow(row, persistedContentType),
    contentType: persistedContentType,
    category,
    genre: row.genre ?? "",
    collection: row.collection_name ?? "",
    collectionOrder: row.collection_order ?? null,
    year: row.release_year ?? null,
    releaseDate: row.release_date ?? "",
    coverPath: row.cover_path ?? "",
    hasCover: Boolean(getCoverPathForRow(row)),
    durationLabel: formatDurationFromSeconds(row.duration),
    fileName: row.file_name,
    filePath: row.file_path,
    localFilePath: row.local_file_path ?? "",
    sourceName: row.source_name ?? "",
    sourcePath: itemSourcePath,
    extension: row.extension,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    subtitlePath: row.subtitle_path ?? "",
    storageType: row.storage_type,
    localStorageType: row.local_storage_type ?? null,
    driveFileId: row.drive_file_id ?? null,
    driveWebViewLink: row.drive_web_view_link ?? null,
    isOffline: Boolean(row.is_offline),
    status: row.status,
    progress: {
      currentTime: row.current_time ?? 0,
      duration: row.duration ?? 0,
      percentage: row.percentage ?? 0,
      completed: Boolean(row.completed ?? 0),
      lastWatchedAt: row.last_watched_at ?? null,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getLibraryRowById(mediaItemId) {
  return db
    .prepare(`
      SELECT
        m.*,
        s.name AS source_name,
        s.path AS source_path,
        s.course_path,
        s.movie_path,
        s.file_path AS category_file_path,
        w.current_time,
        w.duration,
        w.percentage,
        w.completed,
        w.last_watched_at
      FROM media_items m
      LEFT JOIN storage_sources s ON s.id = m.source_id
      LEFT JOIN watch_progress w ON w.media_item_id = m.id
      WHERE m.id = ?
    `)
    .get(mediaItemId);
}

app.get("/api/library", (req, res) => {
  const typeFilter = String(req.query.type ?? "");
  const offlineFilter = req.query.offline;
  const searchQuery = String(req.query.q ?? "").trim().toLowerCase();
  const storageFilter = String(req.query.storage ?? "");
  const statusFilter = String(req.query.status ?? "");
  const coverFilter = String(req.query.cover ?? "");
  const metadataFilter = String(req.query.metadata ?? "");
  const formatFilter = String(req.query.format ?? "").toLowerCase().replace(/^\./, "");

  const whereClauses = [];
  const params = [];

  if (typeFilter === "video" || typeFilter === "videos") {
    whereClauses.push("m.extension IN ('.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.mpg', '.mpeg', '.m2ts', '.mts', '.ts', '.wmv', '.flv', '.ogv', '.ogg', '.3gp', '.3g2', '.divx')");
  }

  if (typeFilter === "pdf" || typeFilter === "pdfs") {
    whereClauses.push("m.extension = '.pdf'");
  }

  if (typeFilter === "archive" || typeFilter === "zip" || typeFilter === "zips") {
    whereClauses.push("m.extension = '.zip'");
  }

  if (formatFilter) {
    whereClauses.push("m.extension = ?");
    params.push(`.${formatFilter}`);
  }

  if (storageFilter === "notebook" || storageFilter === "pendrive" || storageFilter === "google_drive") {
    whereClauses.push("m.storage_type = ?");
    params.push(storageFilter);
  }

  if (storageFilter === "offline") {
    whereClauses.push("m.is_offline = 1");
  }

  if (storageFilter === "unavailable" || storageFilter === "indisponivel") {
    whereClauses.push("m.status IN ('missing', 'pendrive_disconnected')");
  }

  if (storageFilter === "pendrive_disconnected") {
    whereClauses.push("m.status = 'pendrive_disconnected'");
  }

  if (offlineFilter === "true") {
    whereClauses.push("m.is_offline = 1");
  }

  if (
    [
      "available_local",
      "available_pendrive",
      "available_drive",
      "downloading",
      "offline_ready",
      "missing",
      "pendrive_disconnected",
      "error",
    ].includes(statusFilter)
  ) {
    whereClauses.push("m.status = ?");
    params.push(statusFilter);
  }

  if (statusFilter === "available") {
    whereClauses.push("m.status NOT IN ('missing', 'pendrive_disconnected', 'error')");
  }

  const whereStatement = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const rows = db
    .prepare(`
      SELECT
        m.*,
        s.name AS source_name,
        s.path AS source_path,
        s.course_path,
        s.movie_path,
        s.file_path AS category_file_path,
        w.current_time,
        w.duration,
        w.percentage,
        w.completed,
        w.last_watched_at
      FROM media_items m
      LEFT JOIN storage_sources s ON s.id = m.source_id
      LEFT JOIN watch_progress w ON w.media_item_id = m.id
      ${whereStatement}
      ORDER BY m.updated_at DESC
    `)
    .all(...params);

  let mapped = rows.map(mapLibraryRow);

  if (typeFilter === "course" || typeFilter === "movie" || typeFilter === "file") {
    mapped = mapped.filter((item) => item.contentType === typeFilter);
  }

  if (typeFilter === "series" || typeFilter === "collection" || typeFilter === "collections") {
    mapped = mapped.filter((item) => Boolean(item.collection));
  }

  if (searchQuery) {
    mapped = mapped.filter((item) => {
      const searchable = [item.title, item.fileName, item.genre, item.collection, item.category, item.extension, item.releaseDate, item.year]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchable.includes(searchQuery);
    });
  }

  if (coverFilter === "missing") {
    mapped = mapped.filter((item) => !item.hasCover);
  }

  if (coverFilter === "present") {
    mapped = mapped.filter((item) => item.hasCover);
  }

  if (metadataFilter === "missing_genre") {
    mapped = mapped.filter((item) => !item.genre);
  }

  if (metadataFilter === "missing_collection") {
    mapped = mapped.filter((item) => !item.collection);
  }

  res.json({
    success: true,
    data: mapped,
  });
});

app.get("/api/library/:id/cover", (req, res) => {
  const row = db.prepare("SELECT id, cover_path FROM media_items WHERE id = ?").get(req.params.id);
  const coverPath = getCoverPathForRow(row);

  if (!row || !coverPath) {
    res.status(404).json({ success: false, error: { message: "Capa não encontrada para este item." } });
    return;
  }

  const extension = path.extname(coverPath).toLowerCase();
  if (!isCoverImageExtension(extension)) {
    res.status(400).json({ success: false, error: { message: "Formato de capa não suportado." } });
    return;
  }

  res.writeHead(200, {
    "Content-Type": getMimeType(extension),
    "Cache-Control": "no-store",
  });

  createReadStream(coverPath).pipe(res);
});

app.get("/api/library/:id", (req, res) => {
  const row = getLibraryRowById(req.params.id);

  if (!row) {
    res.json({
      success: true,
      data: {
        id: req.params.id,
        removedFromLibrary: true,
        deletedFile: false,
        alreadyMissing: true,
      },
    });
    return;
  }

  res.json({ success: true, data: mapLibraryRow(row) });
});

app.patch("/api/library/:id", (req, res) => {
  const row = db.prepare("SELECT id FROM media_items WHERE id = ?").get(req.params.id);
  if (!row) {
    res.status(404).json({ success: false, error: { message: "Item não encontrado." } });
    return;
  }

  const updates = [];
  const params = [];

  if (Object.hasOwn(req.body ?? {}, "title")) {
    const title = String(req.body.title ?? "").trim();
    if (!title) {
      res.status(400).json({ success: false, error: { message: "Título não pode ficar vazio." } });
      return;
    }

    if (title.length > 180) {
      res.status(400).json({ success: false, error: { message: "Título deve ter no máximo 180 caracteres." } });
      return;
    }

    updates.push("title = ?");
    params.push(title);
  }

  if (Object.hasOwn(req.body ?? {}, "subtitlePath")) {
    const subtitlePath = normalizePath(req.body.subtitlePath ?? "");

    if (subtitlePath && path.extname(subtitlePath).toLowerCase() !== ".vtt") {
      res.status(400).json({ success: false, error: { message: "Inicialmente somente legendas .vtt são suportadas." } });
      return;
    }

    updates.push("subtitle_path = ?");
    params.push(subtitlePath || null);
  }

  if (Object.hasOwn(req.body ?? {}, "genre")) {
    updates.push("genre = ?");
    params.push(normalizeOptionalText(req.body.genre, 80));
  }

  if (Object.hasOwn(req.body ?? {}, "collection")) {
    updates.push("collection_name = ?");
    params.push(normalizeOptionalText(req.body.collection, 120));
  }

  if (Object.hasOwn(req.body ?? {}, "collectionOrder")) {
    const collectionOrder = normalizeOptionalInteger(req.body.collectionOrder);
    if (collectionOrder !== null && collectionOrder < 0) {
      res.status(400).json({ success: false, error: { message: "Ordem na coleção deve ser positiva." } });
      return;
    }

    updates.push("collection_order = ?");
    params.push(collectionOrder);
  }

  if (Object.hasOwn(req.body ?? {}, "year")) {
    const year = normalizeOptionalInteger(req.body.year);
    if (year !== null && (year < 1888 || year > 2200)) {
      res.status(400).json({ success: false, error: { message: "Ano deve ficar entre 1888 e 2200." } });
      return;
    }

    updates.push("release_year = ?");
    params.push(year);
  }

  if (Object.hasOwn(req.body ?? {}, "releaseDate")) {
    const releaseDate = normalizeOptionalDate(req.body.releaseDate);
    if (releaseDate === undefined) {
      res.status(400).json({ success: false, error: { message: "Data deve usar o formato AAAA-MM-DD." } });
      return;
    }

    updates.push("release_date = ?");
    params.push(releaseDate);

    if (releaseDate && !Object.hasOwn(req.body ?? {}, "year")) {
      updates.push("release_year = ?");
      params.push(Number(releaseDate.slice(0, 4)));
    }
  }

  if (Object.hasOwn(req.body ?? {}, "coverPath")) {
    const coverPath = normalizePath(req.body.coverPath ?? "");
    if (coverPath && !isCoverImageExtension(path.extname(coverPath))) {
      res.status(400).json({ success: false, error: { message: "Capa deve ser .jpg, .jpeg, .png ou .webp." } });
      return;
    }

    updates.push("cover_path = ?");
    params.push(coverPath || null);
  }

  if (!updates.length) {
    res.json({ success: true, data: mapLibraryRow(getLibraryRowById(req.params.id)) });
    return;
  }

  const nowIso = getNowIso();
  updates.push("updated_at = ?");
  params.push(nowIso, req.params.id);

  db.prepare(`UPDATE media_items SET ${updates.join(", ")} WHERE id = ?`).run(...params);
  res.json({ success: true, data: mapLibraryRow(getLibraryRowById(req.params.id)) });
});

app.delete("/api/library/:id", (req, res) => {
  const row = db.prepare("SELECT id, title, file_name FROM media_items WHERE id = ?").get(req.params.id);
  if (!row) {
    res.json({
      success: true,
      data: {
        id: req.params.id,
        removedFromLibrary: true,
        deletedFile: false,
        alreadyMissing: true,
      },
    });
    return;
  }

  db.prepare("DELETE FROM media_items WHERE id = ?").run(req.params.id);
  res.json({
    success: true,
    data: {
      id: row.id,
      title: row.title,
      fileName: row.file_name,
      removedFromLibrary: true,
      deletedFile: false,
    },
  });
});

app.delete("/api/library/:id/file", async (req, res) => {
  const row = db
    .prepare("SELECT id, title, file_name, file_path, local_file_path, storage_type FROM media_items WHERE id = ?")
    .get(req.params.id);

  if (!row) {
    res.status(404).json({ success: false, error: { message: "Item não encontrado." } });
    return;
  }

  const physicalPath = getPhysicalMediaPath(row);
  if (!physicalPath || physicalPath.startsWith("drive://")) {
    db.prepare("DELETE FROM media_items WHERE id = ?").run(req.params.id);
    res.json({
      success: true,
      data: {
        id: row.id,
        title: row.title,
        fileName: row.file_name,
        removedFromLibrary: true,
        deletedFile: false,
        fileWasMissing: true,
      },
    });
    return;
  }

  if (!existsSync(physicalPath)) {
    db.prepare("DELETE FROM media_items WHERE id = ?").run(req.params.id);
    res.json({
      success: true,
      data: {
        id: row.id,
        title: row.title,
        fileName: row.file_name,
        path: physicalPath,
        removedFromLibrary: true,
        deletedFile: false,
        fileWasMissing: true,
      },
    });
    return;
  }

  try {
    await unlink(physicalPath);
    db.prepare("DELETE FROM media_items WHERE id = ?").run(req.params.id);
    res.json({
      success: true,
      data: {
        id: row.id,
        title: row.title,
        fileName: row.file_name,
        path: physicalPath,
        removedFromLibrary: true,
        deletedFile: true,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: error.message ?? "Falha ao excluir arquivo físico." },
    });
  }
});

function revealPathInFileManager(filePath) {
  const absolutePath = path.resolve(filePath);
  const directoryPath = path.dirname(absolutePath);

  if (process.platform === "win32") {
    spawn("explorer.exe", [`/select,${absolutePath}`], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  if (process.platform === "darwin") {
    spawn("open", ["-R", absolutePath], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  spawn("xdg-open", [directoryPath], { detached: true, stdio: "ignore" }).unref();
}

function openTargetInSystem(target) {
  if (process.platform === "win32") {
    spawn("cmd.exe", ["/c", "start", "", target], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  if (process.platform === "darwin") {
    spawn("open", [target], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  spawn("xdg-open", [target], { detached: true, stdio: "ignore" }).unref();
}

app.post("/api/library/:id/reveal", (req, res) => {
  const row = db.prepare("SELECT file_path, local_file_path FROM media_items WHERE id = ?").get(req.params.id);
  if (!row) {
    res.status(404).json({ success: false, error: { message: "Item não encontrado." } });
    return;
  }

  const revealPath = row.local_file_path || row.file_path;

  if (!existsSync(revealPath)) {
    res.status(404).json({ success: false, error: { message: "Arquivo não está acessível para abrir a pasta." } });
    return;
  }

  try {
    revealPathInFileManager(revealPath);
    res.json({ success: true, data: { revealed: true } });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message ?? "Falha ao abrir pasta local." } });
  }
});

app.post("/api/library/:id/open", (req, res) => {
  const row = db
    .prepare("SELECT id, file_path, local_file_path, storage_type, drive_web_view_link FROM media_items WHERE id = ?")
    .get(req.params.id);

  if (!row) {
    res.status(404).json({ success: false, error: { message: "Item não encontrado." } });
    return;
  }

  const openPath = row.local_file_path || (row.storage_type === "google_drive" ? "" : row.file_path);
  const driveUrl = row.drive_web_view_link ?? "";
  const target = openPath && existsSync(openPath) ? openPath : driveUrl;

  if (!target) {
    res.status(404).json({ success: false, error: { message: "Não há arquivo local nem link do Drive para abrir." } });
    return;
  }

  try {
    openTargetInSystem(target);
    res.json({
      success: true,
      data: {
        opened: true,
        target,
        targetType: target === driveUrl ? "drive" : "local",
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message ?? "Falha ao abrir mídia." } });
  }
});

app.get("/api/player/:mediaItemId", (req, res) => {
  const row = db
    .prepare(
      "SELECT id, title, file_path, local_file_path, file_name, extension, mime_type, subtitle_path, size_bytes, status, storage_type, drive_file_id, drive_web_view_link FROM media_items WHERE id = ?",
    )
    .get(req.params.mediaItemId);

  if (!row) {
    res.status(404).json({ success: false, error: { message: "Mídia não encontrada." } });
    return;
  }

  const playableFilePath = row.local_file_path || row.file_path;
  const hasLocalPlayableFile = Boolean(playableFilePath && existsSync(playableFilePath));
  const canStreamFromDrive = row.storage_type === "google_drive" && Boolean(row.drive_file_id);

  if (!hasLocalPlayableFile && !canStreamFromDrive) {
    res.status(404).json({ success: false, error: { message: "Arquivo não está acessível no momento. Baixe para notebook ou pendrive antes de reproduzir." } });
    return;
  }

  if (!isVideoExtension(row.extension)) {
    res.status(400).json({ success: false, error: { message: "Somente arquivos de vídeo são reproduzíveis no player." } });
    return;
  }

  const progress = db
    .prepare("SELECT current_time, duration, percentage, completed, last_watched_at FROM watch_progress WHERE media_item_id = ?")
    .get(req.params.mediaItemId);
  const subtitleTracks = hasLocalPlayableFile ? resolveSubtitleTracks(playableFilePath, row.id, row.subtitle_path) : [];

  res.json({
    success: true,
    data: {
      id: row.id,
      title: row.title,
      fileName: row.file_name,
      extension: row.extension,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      streamUrl: `/api/player/${row.id}/stream`,
      isOnlineStream: !hasLocalPlayableFile && canStreamFromDrive,
      driveWebViewLink: row.drive_web_view_link ?? null,
      compatibility: resolveBrowserCompatibility({ extension: row.extension, mimeType: row.mime_type }),
      progress: progress
        ? {
            currentTime: progress.current_time,
            duration: progress.duration,
            percentage: progress.percentage,
            completed: Boolean(progress.completed),
            lastWatchedAt: progress.last_watched_at,
          }
        : null,
      subtitleTracks,
    },
  });
});

app.get("/api/player/:mediaItemId/subtitles/manual", (req, res) => {
  const row = db.prepare("SELECT subtitle_path FROM media_items WHERE id = ?").get(req.params.mediaItemId);
  const subtitlePath = normalizePath(row?.subtitle_path ?? "");

  if (!row || !isUsableSubtitlePath(subtitlePath)) {
    res.status(404).json({ success: false, error: { message: "Legenda associada não encontrada." } });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/vtt; charset=utf-8",
    "Cache-Control": "no-store",
  });

  createReadStream(subtitlePath).pipe(res);
});

app.get("/api/player/:mediaItemId/subtitles/:fileName", (req, res) => {
  const row = db.prepare("SELECT file_path, local_file_path FROM media_items WHERE id = ?").get(req.params.mediaItemId);
  const mediaFilePath = row?.local_file_path || row?.file_path;
  if (!row || !existsSync(mediaFilePath)) {
    res.status(404).json({ success: false, error: { message: "Mídia não encontrada para legenda." } });
    return;
  }

  const decodedFileName = decodeURIComponent(req.params.fileName ?? "");
  const hasInvalidSegment =
    decodedFileName.includes("..") || decodedFileName.includes("/") || decodedFileName.includes("\\");

  if (!decodedFileName || hasInvalidSegment) {
    res.status(400).json({ success: false, error: { message: "Nome de legenda inválido." } });
    return;
  }

  if (!decodedFileName.toLowerCase().endsWith(".vtt")) {
    res.status(400).json({ success: false, error: { message: "Formato de legenda não suportado." } });
    return;
  }

  const mediaDirectory = path.dirname(mediaFilePath);
  const subtitlePath = path.resolve(mediaDirectory, decodedFileName);
  const normalizedDirectory = path.resolve(mediaDirectory);

  if (!subtitlePath.startsWith(normalizedDirectory)) {
    res.status(400).json({ success: false, error: { message: "Caminho de legenda inválido." } });
    return;
  }

  if (!existsSync(subtitlePath)) {
    res.status(404).json({ success: false, error: { message: "Arquivo de legenda não encontrado." } });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/vtt; charset=utf-8",
    "Cache-Control": "no-store",
  });

  createReadStream(subtitlePath).pipe(res);
});

app.get("/api/player/:mediaItemId/stream", async (req, res) => {
  const row = db
    .prepare("SELECT file_path, local_file_path, mime_type, size_bytes, storage_type, drive_file_id FROM media_items WHERE id = ?")
    .get(req.params.mediaItemId);
  const streamFilePath = row?.local_file_path || row?.file_path;

  if (row && (!streamFilePath || !existsSync(streamFilePath)) && row.storage_type === "google_drive" && row.drive_file_id) {
    try {
      const driveResponse = await streamDriveFile({
        driveFileId: row.drive_file_id,
        rangeHeader: req.headers.range,
      });
      const contentLength = driveResponse.headers["content-length"];
      const contentRange = driveResponse.headers["content-range"];
      const responseHeaders = {
        "Content-Type": row.mime_type,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      };

      if (contentLength) {
        responseHeaders["Content-Length"] = contentLength;
      }

      if (contentRange) {
        responseHeaders["Content-Range"] = contentRange;
      }

      driveResponse.stream.on("error", () => {
        if (!res.headersSent) {
          res.status(502).json({ success: false, error: { message: "Falha ao transmitir arquivo do Google Drive." } });
          return;
        }

        res.destroy();
      });

      res.writeHead(driveResponse.status || (req.headers.range ? 206 : 200), responseHeaders);
      driveResponse.stream.pipe(res);
      return;
    } catch (error) {
      res.status(400).json({
        success: false,
        error: {
          message:
            error instanceof Error
              ? `Não foi possível assistir online pelo Google Drive: ${error.message}`
              : "Não foi possível assistir online pelo Google Drive.",
        },
      });
      return;
    }
  }

  if (!row || !existsSync(streamFilePath)) {
    res.status(404).json({ success: false, error: { message: "Arquivo não encontrado para streaming." } });
    return;
  }

  const fileStats = statSync(streamFilePath);
  const fileSize = fileStats.size;
  const range = req.headers.range;

  if (!range) {
    res.writeHead(200, {
      "Content-Type": row.mime_type,
      "Content-Length": fileSize,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    });

    createReadStream(streamFilePath).pipe(res);
    return;
  }

  const bytesPrefix = "bytes=";
  if (!range.startsWith(bytesPrefix)) {
    res.status(416).end();
    return;
  }

  const [startRaw, endRaw] = range.replace(bytesPrefix, "").split("-");
  const start = Number.parseInt(startRaw, 10);
  const end = endRaw ? Number.parseInt(endRaw, 10) : fileSize - 1;

  if (Number.isNaN(start) || Number.isNaN(end) || start >= fileSize || end >= fileSize || start > end) {
    res.status(416).end();
    return;
  }

  const chunkSize = end - start + 1;
  res.writeHead(206, {
    "Content-Range": `bytes ${start}-${end}/${fileSize}`,
    "Accept-Ranges": "bytes",
    "Content-Length": chunkSize,
    "Content-Type": row.mime_type,
    "Cache-Control": "no-store",
  });

  createReadStream(streamFilePath, { start, end }).pipe(res);
});

app.get("/api/progress/:mediaItemId", (req, res) => {
  const progress = db
    .prepare("SELECT current_time, duration, percentage, completed, last_watched_at FROM watch_progress WHERE media_item_id = ?")
    .get(req.params.mediaItemId);

  if (!progress) {
    res.json({ success: true, data: null });
    return;
  }

  res.json({
    success: true,
    data: {
      currentTime: progress.current_time,
      duration: progress.duration,
      percentage: progress.percentage,
      completed: Boolean(progress.completed),
      lastWatchedAt: progress.last_watched_at,
    },
  });
});

app.post("/api/progress", (req, res) => {
  const { mediaItemId, currentTime, duration, completed } = req.body ?? {};

  if (!mediaItemId) {
    res.status(400).json({ success: false, error: { message: "mediaItemId é obrigatório." } });
    return;
  }

  if (!getMediaItemExists(mediaItemId)) {
    res.status(404).json({ success: false, error: { message: "Mídia não encontrada para progresso." } });
    return;
  }

  const currentTimeRaw = Number(currentTime ?? 0);
  const durationRaw = Number(duration ?? 0);

  if (!Number.isFinite(currentTimeRaw) || !Number.isFinite(durationRaw) || currentTimeRaw < 0 || durationRaw < 0) {
    res.status(400).json({ success: false, error: { message: "currentTime e duration devem ser números positivos." } });
    return;
  }

  const numericDuration = durationRaw;
  const numericCurrentTime = numericDuration > 0 ? Math.min(currentTimeRaw, numericDuration) : currentTimeRaw;
  const percentage = numericDuration > 0 ? clampPercentage((numericCurrentTime / numericDuration) * 100) : 0;
  const isCompleted = Boolean(completed) || percentage >= 95;
  const nowIso = getNowIso();

  db.prepare(`
    INSERT INTO watch_progress (media_item_id, current_time, duration, percentage, completed, last_watched_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(media_item_id) DO UPDATE SET
      current_time = excluded.current_time,
      duration = excluded.duration,
      percentage = excluded.percentage,
      completed = excluded.completed,
      last_watched_at = excluded.last_watched_at
  `).run(mediaItemId, numericCurrentTime, numericDuration, percentage, isCompleted ? 1 : 0, nowIso);

  db.prepare("UPDATE media_items SET updated_at = ? WHERE id = ?").run(nowIso, mediaItemId);

  res.json({
    success: true,
    data: {
      mediaItemId,
      currentTime: numericCurrentTime,
      duration: numericDuration,
      percentage,
      completed: isCompleted,
      lastWatchedAt: nowIso,
    },
  });
});

app.post("/api/progress/:mediaItemId/complete", (req, res) => {
  const mediaItemId = req.params.mediaItemId;
  const nowIso = getNowIso();

  if (!getMediaItemExists(mediaItemId)) {
    res.status(404).json({ success: false, error: { message: "Mídia não encontrada para conclusão." } });
    return;
  }

  const row = db.prepare("SELECT duration FROM watch_progress WHERE media_item_id = ?").get(mediaItemId);
  const duration = row?.duration ?? 0;

  db.prepare(`
    INSERT INTO watch_progress (media_item_id, current_time, duration, percentage, completed, last_watched_at)
    VALUES (?, ?, ?, 100, 1, ?)
    ON CONFLICT(media_item_id) DO UPDATE SET
      current_time = excluded.current_time,
      duration = excluded.duration,
      percentage = 100,
      completed = 1,
      last_watched_at = excluded.last_watched_at
  `).run(mediaItemId, duration, duration, nowIso);

  db.prepare("UPDATE media_items SET updated_at = ? WHERE id = ?").run(nowIso, mediaItemId);

  res.json({ success: true, data: { mediaItemId, completed: true, lastWatchedAt: nowIso } });
});

app.get("/api/storage/pendrive/status", (_req, res) => {
  const source = getStorageByType("pendrive");
  const disconnected = source ? source.status === "disconnected" : true;

  res.json({
    success: true,
    data: {
      connected: !disconnected,
      source,
    },
  });
});

app.get("/api/downloads", (_req, res) => {
  res.json({
    success: true,
    data: listDownloads(),
  });
});

app.post("/api/downloads", async (req, res) => {
  const mediaItemId = req.body?.mediaItemId;
  const destinationStorageType = req.body?.destinationStorageType;

  if (!mediaItemId || !destinationStorageType) {
    res.status(400).json({
      success: false,
      error: { message: "mediaItemId e destinationStorageType são obrigatórios." },
    });
    return;
  }

  if (!VALID_DOWNLOAD_DESTINATIONS.has(destinationStorageType)) {
    res.status(400).json({
      success: false,
      error: { message: "Destino de download inválido ou ainda não implementado." },
    });
    return;
  }

  try {
    const download = await enqueueDownload({ mediaItemId, destinationStorageType });
    res.status(201).json({ success: true, data: download });
  } catch (error) {
    res.status(400).json({ success: false, error: { message: error.message } });
  }
});

app.post("/api/downloads/:downloadId/cancel", async (req, res) => {
  const cancelled = await cancelDownload(req.params.downloadId);
  if (!cancelled) {
    res.status(404).json({ success: false, error: { message: "Download não encontrado." } });
    return;
  }

  res.json({ success: true, data: cancelled });
});

app.post("/api/pendrive/copy", async (req, res) => {
  const mediaItemId = req.body?.mediaItemId;
  if (!mediaItemId) {
    res.status(400).json({ success: false, error: { message: "mediaItemId é obrigatório." } });
    return;
  }

  try {
    const download = await copyToPendrive(mediaItemId);
    res.status(201).json({ success: true, data: download });
  } catch (error) {
    res.status(400).json({ success: false, error: { message: error.message } });
  }
});

app.delete("/api/pendrive/items/:mediaItemId", async (req, res) => {
  try {
    const removed = await removeFromPendrive(req.params.mediaItemId);
    res.json({ success: true, data: removed });
  } catch (error) {
    res.status(400).json({ success: false, error: { message: error.message } });
  }
});

app.use((err, _req, res, _next) => {
  res.status(500).json({
    success: false,
    error: {
      message: err?.message ?? "Erro interno inesperado.",
      stack: process.env.NODE_ENV === "development" ? err?.stack : undefined,
    },
  });
});

app.listen(SERVER_PORT, () => {
  console.log(`[mediavault-api] Server running on http://localhost:${SERVER_PORT}`);
  console.log(`[mediavault-api] Database: ${path.resolve("server/data/mediavault.db")}`);
});
