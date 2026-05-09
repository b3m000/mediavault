import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db, getNowIso } from "./db.js";
import { downloadDriveFileToPath } from "./google-drive-service.js";
import { scanStorageSource } from "./scanner.js";
import { bytesToSizeLabel } from "./library-classifier.js";
import { getStorageByType } from "./storage-service.js";

const activeTransfers = new Map();

function getMediaItemById(mediaItemId) {
  return db.prepare("SELECT * FROM media_items WHERE id = ?").get(mediaItemId);
}

function getDownloadById(downloadId) {
  return db.prepare("SELECT * FROM downloads WHERE id = ?").get(downloadId);
}

function resolveDestinationPath({ sourcePath, sourceRootPath, destinationRootPath }) {
  const normalizedSourcePath = String(sourcePath).replace(/\\/g, "/");
  const normalizedSourceRoot = String(sourceRootPath).replace(/\\/g, "/");
  const normalizedDestinationRoot = String(destinationRootPath).replace(/\\/g, "/");

  const relativePath = path.posix.relative(normalizedSourceRoot, normalizedSourcePath);
  const safeRelativePath = relativePath.startsWith("../") ? path.posix.basename(normalizedSourcePath) : relativePath;

  return path.posix.join(normalizedDestinationRoot, safeRelativePath);
}

function getContentRootPath(storageSource, contentType) {
  switch (contentType) {
    case "course":
      return storageSource.course_path || storageSource.path;
    case "movie":
      return storageSource.movie_path || storageSource.path;
    case "file":
      return storageSource.file_path || storageSource.path;
    default:
      return storageSource.path;
  }
}

function updateDownloadProgress({ downloadId, copiedBytes, sizeBytes, status }) {
  const nowIso = getNowIso();
  const progress = sizeBytes > 0 ? (copiedBytes / sizeBytes) * 100 : 0;

  db.prepare(
    "UPDATE downloads SET copied_bytes = ?, size_bytes = ?, progress = ?, status = ?, updated_at = ? WHERE id = ?",
  ).run(copiedBytes, sizeBytes, progress, status, nowIso, downloadId);
}

async function runCopy(downloadId) {
  const download = getDownloadById(downloadId);
  if (!download || download.status === "cancelled") {
    return;
  }

  const destinationDir = path.posix.dirname(download.destination_path);
  await mkdir(destinationDir, { recursive: true });

  if (existsSync(download.destination_path)) {
    throw new Error("Arquivo de destino já existe. Remova-o ou escolha outro destino antes de transferir novamente.");
  }

  const sourceStats = await stat(download.source_path);
  const totalBytes = sourceStats.size;

  let copiedBytes = 0;
  let lastSyncTimestamp = 0;

  updateDownloadProgress({ downloadId, copiedBytes: 0, sizeBytes: totalBytes, status: "downloading" });

  await new Promise((resolve, reject) => {
    const readStream = createReadStream(download.source_path);
    const writeStream = createWriteStream(download.destination_path);

    activeTransfers.set(downloadId, { readStream, writeStream });

    readStream.on("data", (chunk) => {
      copiedBytes += chunk.length;
      const now = Date.now();

      if (now - lastSyncTimestamp >= 500) {
        lastSyncTimestamp = now;
        updateDownloadProgress({ downloadId, copiedBytes, sizeBytes: totalBytes, status: "downloading" });
      }
    });

    readStream.on("error", reject);
    writeStream.on("error", reject);

    writeStream.on("finish", () => {
      resolve(undefined);
    });

    readStream.pipe(writeStream);
  });

  const nowIso = getNowIso();
  db.prepare(
    "UPDATE downloads SET copied_bytes = ?, size_bytes = ?, progress = 100, status = 'completed', updated_at = ?, completed_at = ? WHERE id = ?",
  ).run(totalBytes, totalBytes, nowIso, nowIso, downloadId);

  activeTransfers.delete(downloadId);

  const destinationSource = getStorageByType(download.destination_storage_type);
  if (destinationSource) {
    try {
      await scanStorageSource({ db, source: destinationSource });
    } catch (error) {
      db.prepare("UPDATE downloads SET error_message = ?, updated_at = ? WHERE id = ? AND status = 'completed'").run(
        `Transferência concluída, mas a reindexação falhou: ${error instanceof Error ? error.message : "erro inesperado"}`,
        getNowIso(),
        downloadId,
      );
    }
  }
}

async function runDriveDownload(downloadId) {
  const download = getDownloadById(downloadId);
  if (!download || download.status === "cancelled") {
    return;
  }

  if (existsSync(download.destination_path)) {
    throw new Error("Arquivo de destino já existe. Remova-o ou escolha outro destino antes de transferir novamente.");
  }

  const mediaItem = getMediaItemById(download.media_item_id);
  if (!mediaItem?.drive_file_id) {
    throw new Error("Arquivo do Google Drive não possui ID remoto válido.");
  }

  const totalBytes = mediaItem.size_bytes ?? download.size_bytes ?? 0;
  let lastSyncTimestamp = 0;

  updateDownloadProgress({ downloadId, copiedBytes: 0, sizeBytes: totalBytes, status: "downloading" });

  const copiedBytes = await downloadDriveFileToPath({
    driveFileId: mediaItem.drive_file_id,
    destinationPath: download.destination_path,
    onProgress: (nextCopiedBytes) => {
      const now = Date.now();
      if (now - lastSyncTimestamp >= 500) {
        lastSyncTimestamp = now;
        updateDownloadProgress({
          downloadId,
          copiedBytes: nextCopiedBytes,
          sizeBytes: totalBytes || nextCopiedBytes,
          status: "downloading",
        });
      }
    },
  });

  const current = getDownloadById(downloadId);
  if (current?.status === "cancelled") {
    if (existsSync(download.destination_path)) {
      await unlink(download.destination_path);
    }
    return;
  }

  const nowIso = getNowIso();
  db.prepare(
    "UPDATE downloads SET copied_bytes = ?, size_bytes = ?, progress = 100, status = 'completed', updated_at = ?, completed_at = ? WHERE id = ?",
  ).run(copiedBytes, totalBytes || copiedBytes, nowIso, nowIso, downloadId);

  db.prepare(`
    UPDATE media_items
    SET
      local_file_path = ?,
      local_storage_type = ?,
      is_offline = 1,
      status = 'offline_ready',
      updated_at = ?
    WHERE id = ?
  `).run(download.destination_path, download.destination_storage_type, nowIso, mediaItem.id);
}

async function runTransfer(downloadId) {
  const download = getDownloadById(downloadId);
  if (download?.source_storage_type === "google_drive") {
    await runDriveDownload(downloadId);
    return;
  }

  await runCopy(downloadId);
}

export function listDownloads() {
  return db
    .prepare(`
      SELECT
        d.*,
        m.title as media_title,
        m.file_name as media_file_name
      FROM downloads d
      JOIN media_items m ON m.id = d.media_item_id
      ORDER BY d.created_at DESC
    `)
    .all()
    .map((row) => ({
      id: row.id,
      mediaItemId: row.media_item_id,
      title: row.media_title,
      fileName: row.media_file_name,
      source: row.source_storage_type,
      destination: row.destination_storage_type,
      sourcePath: row.source_path,
      destinationPath: row.destination_path,
      status: row.status,
      progress: row.progress,
      copiedBytes: row.copied_bytes,
      sizeBytes: row.size_bytes,
      size: bytesToSizeLabel(row.size_bytes),
      createdAt: row.created_at,
      completedAt: row.completed_at,
      errorMessage: row.error_message,
    }));
}

export async function enqueueDownload({ mediaItemId, destinationStorageType }) {
  const mediaItem = getMediaItemById(mediaItemId);
  if (!mediaItem) {
    throw new Error("Mídia não encontrada para download.");
  }

  const isDriveSource = mediaItem.storage_type === "google_drive";

  if (!isDriveSource && !existsSync(mediaItem.file_path)) {
    throw new Error("Arquivo de origem não está acessível.");
  }

  const sourceStorage = getStorageByType(mediaItem.storage_type);
  const destinationStorage = getStorageByType(destinationStorageType);

  if (!sourceStorage) {
    throw new Error("Origem não configurada.");
  }

  if (!destinationStorage) {
    throw new Error("Destino não configurado.");
  }

  if (destinationStorage.status === "disconnected") {
    throw new Error("Destino está desconectado.");
  }

  if (destinationStorage.type === mediaItem.storage_type) {
    throw new Error("Origem e destino não podem ser iguais.");
  }

  const downloadId = randomUUID();
  const destinationPath = isDriveSource
    ? path.posix.join(getContentRootPath(destinationStorage, mediaItem.content_type), mediaItem.file_name)
    : resolveDestinationPath({
        sourcePath: mediaItem.file_path,
        sourceRootPath: getContentRootPath(sourceStorage, mediaItem.content_type),
        destinationRootPath: getContentRootPath(destinationStorage, mediaItem.content_type),
      });

  const nowIso = getNowIso();

  db.prepare(`
    INSERT INTO downloads (
      id,
      media_item_id,
      source_storage_type,
      destination_storage_type,
      source_path,
      destination_path,
      status,
      progress,
      size_bytes,
      copied_bytes,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, ?, 0, ?, ?)
  `).run(
    downloadId,
    mediaItem.id,
    mediaItem.storage_type,
    destinationStorage.type,
    isDriveSource ? `drive://${mediaItem.drive_file_id}` : mediaItem.file_path,
    destinationPath,
    mediaItem.size_bytes ?? 0,
    nowIso,
    nowIso,
  );

  runTransfer(downloadId).catch((error) => {
    const current = getDownloadById(downloadId);
    if (current?.status === "cancelled") {
      activeTransfers.delete(downloadId);
      return;
    }

    const failedAt = getNowIso();
    db.prepare("UPDATE downloads SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?").run(
      error instanceof Error ? error.message : "Falha inesperada no download.",
      failedAt,
      downloadId,
    );
    activeTransfers.delete(downloadId);
  });

  return getDownloadById(downloadId);
}

export async function cancelDownload(downloadId) {
  const active = activeTransfers.get(downloadId);
  if (active) {
    active.readStream.destroy(new Error("download_cancelled"));
    active.writeStream.destroy(new Error("download_cancelled"));
    activeTransfers.delete(downloadId);
  }

  const nowIso = getNowIso();
  db.prepare("UPDATE downloads SET status = 'cancelled', updated_at = ? WHERE id = ? AND status IN ('queued', 'downloading')").run(
    nowIso,
    downloadId,
  );

  const cancelled = getDownloadById(downloadId);
  if (cancelled?.destination_path && existsSync(cancelled.destination_path)) {
    try {
      await unlink(cancelled.destination_path);
    } catch {
      // Best effort: the next scan/status refresh will still surface the item correctly.
    }
  }

  return cancelled;
}

export async function copyToPendrive(mediaItemId) {
  return enqueueDownload({ mediaItemId, destinationStorageType: "pendrive" });
}

export async function removeFromPendrive(mediaItemId) {
  const mediaItem = getMediaItemById(mediaItemId);
  if (!mediaItem) {
    throw new Error("Item não encontrado.");
  }

  if (mediaItem.storage_type !== "pendrive") {
    throw new Error("Item não está no pendrive.");
  }

  if (existsSync(mediaItem.file_path)) {
    const { unlink } = await import("node:fs/promises");
    await unlink(mediaItem.file_path);
  }

  const nowIso = getNowIso();
  db.prepare("UPDATE media_items SET status = 'missing', is_offline = 0, updated_at = ? WHERE id = ?").run(nowIso, mediaItemId);

  return { id: mediaItemId, removed: true };
}
