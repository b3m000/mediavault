import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DB_PATH, MEDIA_DEFAULT_PATH, PENDRIVE_DEFAULT_PATH } from "./config.js";

function nowIso() {
  return new Date().toISOString();
}

const dbDirectory = path.dirname(DB_PATH);
if (!existsSync(dbDirectory)) {
  mkdirSync(dbDirectory, { recursive: true });
}

export const db = new DatabaseSync(DB_PATH);

db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS storage_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('notebook', 'pendrive', 'google_drive')),
    path TEXT NOT NULL,
    status TEXT NOT NULL,
    last_scan_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(type)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS contents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('course', 'movie', 'file')),
    description TEXT,
    category TEXT NOT NULL,
    thumbnail_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS media_items (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    extension TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    storage_type TEXT NOT NULL CHECK(storage_type IN ('notebook', 'pendrive', 'google_drive')),
    source_id INTEGER,
    is_offline INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    FOREIGN KEY(source_id) REFERENCES storage_sources(id) ON DELETE SET NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS downloads (
    id TEXT PRIMARY KEY,
    media_item_id TEXT NOT NULL,
    source_storage_type TEXT NOT NULL CHECK(source_storage_type IN ('notebook', 'pendrive', 'google_drive')),
    destination_storage_type TEXT NOT NULL CHECK(destination_storage_type IN ('notebook', 'pendrive', 'google_drive')),
    source_path TEXT NOT NULL,
    destination_path TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('queued', 'downloading', 'paused', 'completed', 'failed', 'cancelled')),
    progress REAL NOT NULL DEFAULT 0,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    copied_bytes INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY(media_item_id) REFERENCES media_items(id) ON DELETE CASCADE
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS watch_progress (
    media_item_id TEXT PRIMARY KEY,
    current_time REAL NOT NULL DEFAULT 0,
    duration REAL NOT NULL DEFAULT 0,
    percentage REAL NOT NULL DEFAULT 0,
    completed INTEGER NOT NULL DEFAULT 0,
    last_watched_at TEXT NOT NULL,
    FOREIGN KEY(media_item_id) REFERENCES media_items(id) ON DELETE CASCADE
  );
`);

function ensureDefaultSource(type, name, sourcePath, status) {
  const existing = db.prepare("SELECT id FROM storage_sources WHERE type = ?").get(type);
  if (existing) {
    return;
  }

  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO storage_sources (name, type, path, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, type, sourcePath, status, timestamp, timestamp);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS content_tags (
    content_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (content_id, tag_id),
    FOREIGN KEY(content_id) REFERENCES contents(id) ON DELETE CASCADE,
    FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
  );
`);

ensureDefaultSource("notebook", "Notebook Principal", MEDIA_DEFAULT_PATH, existsSync(MEDIA_DEFAULT_PATH) ? "active" : "disconnected");
ensureDefaultSource("pendrive", "Pendrive", PENDRIVE_DEFAULT_PATH, existsSync(PENDRIVE_DEFAULT_PATH) ? "connected" : "disconnected");

export function getNowIso() {
  return nowIso();
}
