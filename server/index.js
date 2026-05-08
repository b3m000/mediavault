import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import express from "express";
import { SERVER_PORT } from "./config.js";
import { isVideoExtension } from "./constants.js";
import { db, getNowIso } from "./db.js";
import { enqueueDownload, cancelDownload, copyToPendrive, listDownloads, removeFromPendrive } from "./download-service.js";
import { formatDurationFromSeconds, resolveCategory, resolveContentType, resolveThumbnail } from "./library-classifier.js";
import { scanStorageSource } from "./scanner.js";
import { getDatabase, getStorageByType, getStorageSources, upsertStorageSource } from "./storage-service.js";

const app = express();
app.use(express.json());
const SUPPORTED_SUBTITLE_EXTENSIONS = new Set([".vtt"]);
const VALID_SCAN_TYPES = new Set(["all", "notebook", "pendrive"]);
const VALID_DOWNLOAD_DESTINATIONS = new Set(["notebook", "pendrive"]);

function clampPercentage(value) {
  return Math.max(0, Math.min(100, value));
}

function getMediaItemExists(mediaItemId) {
  return db.prepare("SELECT id FROM media_items WHERE id = ?").get(mediaItemId);
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

function resolveSubtitleTracks(filePath, mediaItemId) {
  const mediaDirectory = path.dirname(filePath);
  const mediaBaseName = path.basename(filePath, path.extname(filePath));
  let entries = [];

  try {
    entries = readdirSync(mediaDirectory, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => {
      const extension = path.extname(fileName).toLowerCase();
      if (!SUPPORTED_SUBTITLE_EXTENSIONS.has(extension)) {
        return false;
      }

      return fileName === `${mediaBaseName}.vtt` || fileName.startsWith(`${mediaBaseName}.`);
    })
    .sort((a, b) => a.localeCompare(b))
    .map((fileName, index) => {
      const suffix = fileName.replace(`${mediaBaseName}.`, "").replace(/\.vtt$/i, "");
      const language = normalizeSubtitleLanguage(suffix === mediaBaseName ? "" : suffix);

      return {
        id: `${mediaItemId}-${index}`,
        label: suffix ? language.label : "Legenda padrão",
        lang: suffix ? language.lang : "pt-BR",
        kind: "subtitles",
        url: `/api/player/${mediaItemId}/subtitles/${encodeURIComponent(fileName)}`,
        default: index === 0,
      };
    });
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

  const data = sources.map((source) => ({
    ...source,
    usedBytes: usageStatement.get(source.id).used_bytes,
  }));

  res.json({ success: true, data });
});

app.post("/api/storage/notebook", (req, res) => {
  const sourcePath = req.body?.path;
  const name = req.body?.name ?? "Notebook Principal";

  try {
    const source = upsertStorageSource({ type: "notebook", name, sourcePath });
    res.json({ success: true, data: source });
  } catch (error) {
    res.status(400).json({ success: false, error: { message: error.message } });
  }
});

app.post("/api/storage/pendrive", (req, res) => {
  const sourcePath = req.body?.path;
  const name = req.body?.name ?? "Pendrive";

  try {
    const source = upsertStorageSource({ type: "pendrive", name, sourcePath });
    res.json({ success: true, data: source });
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

function mapLibraryRow(row) {
  const contentType = resolveContentType({
    extension: row.extension,
    filePath: row.file_path,
    sourcePath: row.source_path ?? "",
  });
  const category = resolveCategory({
    filePath: row.file_path,
    sourcePath: row.source_path ?? "",
    extension: row.extension,
  });

  return {
    id: row.id,
    title: row.title,
    description: `Arquivo local: ${row.file_name}`,
    thumbnail: resolveThumbnail(contentType),
    contentType,
    category,
    durationLabel: formatDurationFromSeconds(row.duration),
    fileName: row.file_name,
    filePath: row.file_path,
    extension: row.extension,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    storageType: row.storage_type,
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

app.get("/api/library", (req, res) => {
  const typeFilter = req.query.type;
  const offlineFilter = req.query.offline;
  const searchQuery = String(req.query.q ?? "").trim().toLowerCase();

  const whereClauses = [];
  const params = [];

  if (typeFilter === "video") {
    whereClauses.push("m.extension IN ('.mp4', '.mkv', '.avi', '.mov')");
  }

  if (typeFilter === "pdf") {
    whereClauses.push("m.extension = '.pdf'");
  }

  if (typeFilter === "archive") {
    whereClauses.push("m.extension = '.zip'");
  }

  if (typeFilter === "pendrive") {
    whereClauses.push("m.storage_type = 'pendrive'");
  }

  if (offlineFilter === "true") {
    whereClauses.push("m.is_offline = 1");
  }

  const whereStatement = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const rows = db
    .prepare(`
      SELECT
        m.*,
        s.path AS source_path,
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

  if (searchQuery) {
    mapped = mapped.filter((item) => item.title.toLowerCase().includes(searchQuery) || item.fileName.toLowerCase().includes(searchQuery));
  }

  res.json({
    success: true,
    data: mapped,
  });
});

app.get("/api/library/:id", (req, res) => {
  const row = db
    .prepare(`
      SELECT
        m.*,
        s.path AS source_path,
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
    .get(req.params.id);

  if (!row) {
    res.status(404).json({ success: false, error: { message: "Item não encontrado." } });
    return;
  }

  res.json({ success: true, data: mapLibraryRow(row) });
});

app.get("/api/player/:mediaItemId", (req, res) => {
  const row = db
    .prepare(
      "SELECT id, title, file_path, file_name, extension, mime_type, size_bytes, status FROM media_items WHERE id = ?",
    )
    .get(req.params.mediaItemId);

  if (!row) {
    res.status(404).json({ success: false, error: { message: "Mídia não encontrada." } });
    return;
  }

  if (!existsSync(row.file_path)) {
    res.status(404).json({ success: false, error: { message: "Arquivo não está acessível no momento." } });
    return;
  }

  if (!isVideoExtension(row.extension)) {
    res.status(400).json({ success: false, error: { message: "Somente arquivos de vídeo são reproduzíveis no player." } });
    return;
  }

  const progress = db
    .prepare("SELECT current_time, duration, percentage, completed, last_watched_at FROM watch_progress WHERE media_item_id = ?")
    .get(req.params.mediaItemId);
  const subtitleTracks = resolveSubtitleTracks(row.file_path, row.id);

  res.json({
    success: true,
    data: {
      id: row.id,
      title: row.title,
      fileName: row.file_name,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      streamUrl: `/api/player/${row.id}/stream`,
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

app.get("/api/player/:mediaItemId/subtitles/:fileName", (req, res) => {
  const row = db.prepare("SELECT file_path FROM media_items WHERE id = ?").get(req.params.mediaItemId);
  if (!row || !existsSync(row.file_path)) {
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

  const mediaDirectory = path.dirname(row.file_path);
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

app.get("/api/player/:mediaItemId/stream", (req, res) => {
  const row = db
    .prepare("SELECT file_path, mime_type FROM media_items WHERE id = ?")
    .get(req.params.mediaItemId);

  if (!row || !existsSync(row.file_path)) {
    res.status(404).json({ success: false, error: { message: "Arquivo não encontrado para streaming." } });
    return;
  }

  const fileStats = statSync(row.file_path);
  const fileSize = fileStats.size;
  const range = req.headers.range;

  if (!range) {
    res.writeHead(200, {
      "Content-Type": row.mime_type,
      "Content-Length": fileSize,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    });

    createReadStream(row.file_path).pipe(res);
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

  createReadStream(row.file_path, { start, end }).pipe(res);
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
