import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getStatusByStorageType, getMimeType, isSupportedExtension } from "./constants.js";
import { getNowIso } from "./db.js";

function getTitleFromFileName(fileName) {
  return fileName.replace(/\.[^/.]+$/, "");
}

function createMediaItemId(filePath) {
  return createHash("sha1").update(filePath.toLowerCase()).digest("hex");
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

export async function scanStorageSource({ db, source }) {
  const nowIso = getNowIso();

  let rootStats;
  try {
    rootStats = await fs.stat(source.path);
  } catch {
    throw new Error(`Fonte inacessível para escaneamento: ${source.path}`);
  }

  if (!rootStats.isDirectory()) {
    throw new Error(`Fonte de armazenamento não é uma pasta: ${source.path}`);
  }

  const files = await walkFiles(source.path);
  const scannedPaths = new Set();

  const upsertStatement = db.prepare(`
    INSERT INTO media_items (
      id,
      title,
      file_name,
      file_path,
      extension,
      mime_type,
      size_bytes,
      storage_type,
      source_id,
      is_offline,
      status,
      created_at,
      updated_at,
      last_seen_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_path) DO UPDATE SET
      title = excluded.title,
      file_name = excluded.file_name,
      extension = excluded.extension,
      mime_type = excluded.mime_type,
      size_bytes = excluded.size_bytes,
      storage_type = excluded.storage_type,
      source_id = excluded.source_id,
      is_offline = excluded.is_offline,
      status = excluded.status,
      updated_at = excluded.updated_at,
      last_seen_at = excluded.last_seen_at
  `);

  for (const file of files) {
    const normalizedPath = file.absolutePath.replace(/\\/g, "/");
    scannedPaths.add(normalizedPath);

    const mediaId = createMediaItemId(normalizedPath);
    const status = getStatusByStorageType(source.type);
    const isOffline = source.type === "notebook" || source.type === "pendrive" ? 1 : 0;

    upsertStatement.run(
      mediaId,
      getTitleFromFileName(file.fileName),
      file.fileName,
      normalizedPath,
      file.extension,
      getMimeType(file.extension),
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

  const existingRows = db.prepare("SELECT file_path FROM media_items WHERE source_id = ?").all(source.id);
  const markMissingStatement = db.prepare(
    "UPDATE media_items SET status = 'missing', is_offline = 0, updated_at = ? WHERE source_id = ? AND file_path = ?",
  );

  for (const row of existingRows) {
    if (!scannedPaths.has(row.file_path)) {
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
    scannedFiles: files.length,
    sourceId: source.id,
    sourceType: source.type,
    sourcePath: source.path,
  };
}
