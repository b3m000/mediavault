import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getStatusByStorageType, getMimeType, isCoverImageExtension, isSupportedExtension } from "./constants.js";
import { getNowIso } from "./db.js";
import {
  CONTENT_TYPES,
  getSourceContentPaths,
  isPathInsideDirectory,
  resolveContentType,
} from "./library-classifier.js";

const MOVIE_TITLE_NOISE = new Set([
  "480p",
  "720p",
  "1080p",
  "2160p",
  "4k",
  "8k",
  "bluray",
  "brrip",
  "dvdrip",
  "hdrip",
  "webrip",
  "webdl",
  "web-dl",
  "x264",
  "x265",
  "h264",
  "h265",
  "hevc",
  "aac",
  "ac3",
  "dts",
  "dual",
  "dubbed",
  "legendado",
  "repack",
  "proper",
]);

function toDisplayTitle(input) {
  return input
    .replace(/[._]+/g, " ")
    .replace(/[-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (/^\d+$/.test(word)) {
        return word;
      }

      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function getTitleFromFileName(fileName, contentType) {
  const rawTitle = fileName.replace(/\.[^/.]+$/, "");

  if (contentType === "movie") {
    const cleaned = rawTitle
      .replace(/\[[^\]]*]/g, " ")
      .replace(/\([^)]*\)/g, " ")
      .replace(/[._-]+/g, " ")
      .split(/\s+/)
      .filter((token) => {
        const normalized = token.toLowerCase();
        return normalized && !MOVIE_TITLE_NOISE.has(normalized) && !/^\d{3,4}p$/i.test(normalized);
      })
      .join(" ");

    return toDisplayTitle(cleaned || rawTitle);
  }

  return toDisplayTitle(rawTitle);
}

function createMediaItemId(filePath) {
  return createHash("sha1").update(filePath.toLowerCase()).digest("hex");
}

async function resolveCoverPath(filePath) {
  const directoryPath = path.dirname(filePath);
  const parsed = path.parse(filePath);
  let entries = [];

  try {
    entries = await fs.readdir(directoryPath, { withFileTypes: true });
  } catch {
    return null;
  }

  const imageFilesByName = new Map(
    entries
      .filter((entry) => entry.isFile() && isCoverImageExtension(path.extname(entry.name)))
      .map((entry) => [entry.name.toLowerCase(), entry.name]),
  );
  const preferredNames = [parsed.name, "cover", "poster"].flatMap((baseName) =>
    [".jpg", ".jpeg", ".png", ".webp"].map((extension) => `${baseName}${extension}`.toLowerCase()),
  );

  for (const preferredName of preferredNames) {
    const realFileName = imageFilesByName.get(preferredName);
    if (realFileName) {
      return path.join(directoryPath, realFileName).replace(/\\/g, "/");
    }
  }

  return null;
}

async function walkFiles(rootPath) {
  const queue = [rootPath];
  const discovered = [];

  while (queue.length > 0) {
    const current = queue.shift();
    let entries = [];

    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        queue.push(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      if (!isSupportedExtension(extension)) {
        continue;
      }

      let stats;
      try {
        stats = await fs.stat(absolutePath);
      } catch {
        continue;
      }

      discovered.push({
        absolutePath,
        fileName: entry.name,
        extension,
        sizeBytes: stats.size,
      });
    }
  }

  return discovered;
}

function buildScanTargets(source) {
  const configuredTargets = getSourceContentPaths(source);
  if (configuredTargets.length > 0) {
    return configuredTargets;
  }

  return [{ contentType: null, path: source.path }];
}

async function getAvailableScanTargets(source) {
  const targets = buildScanTargets(source);
  const available = [];
  const skipped = [];

  for (const target of targets) {
    let stats;

    try {
      stats = await fs.stat(target.path);
    } catch {
      skipped.push({ ...target, reason: "path_inaccessible" });
      continue;
    }

    if (!stats.isDirectory()) {
      skipped.push({ ...target, reason: "not_directory" });
      continue;
    }

    available.push(target);
  }

  if (available.length === 0 && source.path && !targets.some((target) => target.path === source.path)) {
    try {
      const rootStats = await fs.stat(source.path);
      if (rootStats.isDirectory()) {
        available.push({ contentType: null, path: source.path });
      }
    } catch {
      // Category paths remain the source of truth when the root is unavailable.
    }
  }

  return { available, skipped };
}

function shouldMarkMissing(filePath, scannedRoots) {
  return scannedRoots.some((rootPath) => isPathInsideDirectory(filePath, rootPath));
}

export async function scanStorageSource({ db, source }) {
  const nowIso = getNowIso();
  const { available, skipped } = await getAvailableScanTargets(source);

  if (available.length === 0) {
    throw new Error(`Nenhum caminho configurado está acessível para escaneamento: ${source.path}`);
  }

  const scannedPaths = new Set();
  const scannedRoots = available.map((target) => target.path);
  const scannedByType = CONTENT_TYPES.reduce((result, contentType) => {
    result[contentType] = 0;
    return result;
  }, {});

  const upsertStatement = db.prepare(`
    INSERT INTO media_items (
      id,
      title,
      file_name,
      file_path,
      extension,
      mime_type,
      content_type,
      cover_path,
      local_file_path,
      local_storage_type,
      size_bytes,
      storage_type,
      source_id,
      is_offline,
      status,
      created_at,
      updated_at,
      last_seen_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_path) DO UPDATE SET
      file_name = excluded.file_name,
      extension = excluded.extension,
      mime_type = excluded.mime_type,
      content_type = excluded.content_type,
      cover_path = COALESCE(NULLIF(media_items.cover_path, ''), excluded.cover_path),
      local_file_path = excluded.local_file_path,
      local_storage_type = excluded.local_storage_type,
      size_bytes = excluded.size_bytes,
      storage_type = excluded.storage_type,
      source_id = excluded.source_id,
      is_offline = excluded.is_offline,
      status = excluded.status,
      updated_at = excluded.updated_at,
      last_seen_at = excluded.last_seen_at
  `);
  const findDriveLocalCopyStatement = db.prepare(
    "SELECT id FROM media_items WHERE drive_file_id IS NOT NULL AND local_file_path = ?",
  );

  for (const target of available) {
    const files = await walkFiles(target.path);

    for (const file of files) {
      const normalizedPath = file.absolutePath.replace(/\\/g, "/");
      scannedPaths.add(normalizedPath);

      const contentType = resolveContentType({
        extension: file.extension,
        filePath: normalizedPath,
        sourcePath: target.path,
        source,
        preferredContentType: target.contentType,
      });
      const mediaId = createMediaItemId(normalizedPath);
      const status = getStatusByStorageType(source.type);
      const isOffline = source.type === "notebook" || source.type === "pendrive" ? 1 : 0;
      scannedByType[contentType] += 1;
      const existingDriveLocalCopy = findDriveLocalCopyStatement.get(normalizedPath);
      const coverPath = contentType === "movie" ? await resolveCoverPath(normalizedPath) : null;

      if (existingDriveLocalCopy) {
        db.prepare(`
          UPDATE media_items
          SET
            cover_path = COALESCE(NULLIF(cover_path, ''), ?),
            local_file_path = ?,
            local_storage_type = ?,
            size_bytes = ?,
            is_offline = 1,
            status = 'offline_ready',
            updated_at = ?,
            last_seen_at = ?
          WHERE id = ?
        `).run(coverPath, normalizedPath, source.type, file.sizeBytes, nowIso, nowIso, existingDriveLocalCopy.id);
        continue;
      }

      upsertStatement.run(
        mediaId,
        getTitleFromFileName(file.fileName, contentType),
        file.fileName,
        normalizedPath,
        file.extension,
        getMimeType(file.extension),
        contentType,
        coverPath,
        normalizedPath,
        source.type,
        file.sizeBytes,
        source.type,
        source.id,
        isOffline,
        status,
        nowIso,
        nowIso,
        nowIso,
      );
    }
  }

  const existingRows = db.prepare("SELECT file_path FROM media_items WHERE source_id = ?").all(source.id);
  const markMissingStatement = db.prepare(
    "UPDATE media_items SET status = 'missing', is_offline = 0, updated_at = ? WHERE source_id = ? AND file_path = ?",
  );

  for (const row of existingRows) {
    if (shouldMarkMissing(row.file_path, scannedRoots) && !scannedPaths.has(row.file_path)) {
      markMissingStatement.run(nowIso, source.id, row.file_path);
    }
  }

  db.prepare("UPDATE storage_sources SET status = ?, last_scan_at = ?, updated_at = ? WHERE id = ?").run(
    source.type === "notebook" ? "active" : "connected",
    nowIso,
    nowIso,
    source.id,
  );

  if (source.type === "pendrive") {
    db.prepare(
      "UPDATE media_items SET status = 'available_pendrive', is_offline = 1, updated_at = ? WHERE source_id = ? AND status != 'missing'",
    ).run(nowIso, source.id);
  }

  return {
    scannedFiles: scannedPaths.size,
    scannedByType,
    skippedTargets: skipped,
    sourceId: source.id,
    sourceType: source.type,
    sourcePath: source.path,
  };
}
