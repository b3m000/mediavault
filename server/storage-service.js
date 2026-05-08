import { existsSync } from "node:fs";
import { db, getNowIso } from "./db.js";
import { normalizePath } from "./config.js";

function getStorageRow(type) {
  return db.prepare("SELECT * FROM storage_sources WHERE type = ?").get(type);
}

export function upsertStorageSource({ type, name, sourcePath }) {
  const normalizedPath = normalizePath(sourcePath);

  if (!normalizedPath) {
    throw new Error("Caminho inválido para armazenamento.");
  }

  const nowIso = getNowIso();
  const isPathAvailable = existsSync(normalizedPath);
  const status = type === "notebook" ? (isPathAvailable ? "active" : "disconnected") : isPathAvailable ? "connected" : "disconnected";

  db.prepare(`
    INSERT INTO storage_sources (name, type, path, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(type) DO UPDATE SET
      name = excluded.name,
      path = excluded.path,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).run(name, type, normalizedPath, status, nowIso, nowIso);

  return getStorageRow(type);
}

export function refreshStorageStatus() {
  const nowIso = getNowIso();
  const sources = db.prepare("SELECT * FROM storage_sources").all();

  for (const source of sources) {
    const connected = existsSync(source.path);
    let status = source.status;

    if (source.type === "notebook") {
      status = connected ? "active" : "disconnected";
    }

    if (source.type === "pendrive") {
      status = connected ? "connected" : "disconnected";
    }

    db.prepare("UPDATE storage_sources SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso, source.id);

    if (source.type === "pendrive") {
      if (!connected) {
        db.prepare(
          "UPDATE media_items SET status = 'pendrive_disconnected', is_offline = 0, updated_at = ? WHERE source_id = ? AND status != 'missing'",
        ).run(nowIso, source.id);
      }

      if (connected) {
        db.prepare(
          "UPDATE media_items SET status = 'available_pendrive', is_offline = 1, updated_at = ? WHERE source_id = ? AND status = 'pendrive_disconnected'",
        ).run(nowIso, source.id);
      }
    }
  }
}

export function getStorageSources() {
  refreshStorageStatus();
  return db.prepare("SELECT * FROM storage_sources ORDER BY type").all();
}

export function getStorageByType(type) {
  refreshStorageStatus();
  return db.prepare("SELECT * FROM storage_sources WHERE type = ?").get(type);
}

export function getDatabase() {
  return db;
}
