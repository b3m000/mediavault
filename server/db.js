import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  DB_PATH,
  GOOGLE_DRIVE_DEFAULT_PATH,
  MEDIA_DEFAULT_PATH,
  NOTEBOOK_DEFAULT_CATEGORY_PATHS,
  PENDRIVE_DEFAULT_CATEGORY_PATHS,
  PENDRIVE_DEFAULT_PATH,
  getDefaultCategoryPaths,
} from "./config.js";

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
    course_path TEXT,
    movie_path TEXT,
    file_path TEXT,
    role TEXT NOT NULL DEFAULT 'offline' CHECK(role IN ('primary', 'offline')),
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
    content_type TEXT CHECK(content_type IN ('course', 'movie', 'file')),
    genre TEXT,
    collection_name TEXT,
    collection_order INTEGER,
    release_year INTEGER,
    release_date TEXT,
    cover_path TEXT,
    subtitle_path TEXT,
    drive_file_id TEXT,
    drive_web_view_link TEXT,
    drive_web_content_link TEXT,
    drive_modified_time TEXT,
    checksum TEXT,
    local_file_path TEXT,
    local_storage_type TEXT CHECK(local_storage_type IN ('notebook', 'pendrive')),
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

function getTableColumns(tableName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
}

function ensureColumn(tableName, columnName, definition) {
  const columns = getTableColumns(tableName);
  if (columns.includes(columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
}

ensureColumn("storage_sources", "course_path", "TEXT");
ensureColumn("storage_sources", "movie_path", "TEXT");
ensureColumn("storage_sources", "file_path", "TEXT");
ensureColumn("storage_sources", "role", "TEXT NOT NULL DEFAULT 'offline'");
ensureColumn("media_items", "content_type", "TEXT");
ensureColumn("media_items", "genre", "TEXT");
ensureColumn("media_items", "collection_name", "TEXT");
ensureColumn("media_items", "collection_order", "INTEGER");
ensureColumn("media_items", "release_year", "INTEGER");
ensureColumn("media_items", "release_date", "TEXT");
ensureColumn("media_items", "cover_path", "TEXT");
ensureColumn("media_items", "subtitle_path", "TEXT");
ensureColumn("media_items", "drive_file_id", "TEXT");
ensureColumn("media_items", "drive_web_view_link", "TEXT");
ensureColumn("media_items", "drive_web_content_link", "TEXT");
ensureColumn("media_items", "drive_modified_time", "TEXT");
ensureColumn("media_items", "checksum", "TEXT");
ensureColumn("media_items", "local_file_path", "TEXT");
ensureColumn("media_items", "local_storage_type", "TEXT");

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_media_items_drive_file_id
  ON media_items(drive_file_id)
  WHERE drive_file_id IS NOT NULL;
`);

function ensureDefaultSource(type, name, sourcePath, status, categoryPaths, role = "offline") {
  const existing = db.prepare("SELECT id, course_path, movie_path, file_path FROM storage_sources WHERE type = ?").get(type);
  const defaults = categoryPaths ?? getDefaultCategoryPaths(sourcePath);

  if (existing) {
    db.prepare(`
      UPDATE storage_sources
      SET
        course_path = COALESCE(NULLIF(course_path, ''), ?),
        movie_path = COALESCE(NULLIF(movie_path, ''), ?),
        file_path = COALESCE(NULLIF(file_path, ''), ?),
        role = COALESCE(NULLIF(role, ''), ?)
      WHERE id = ?
    `).run(defaults.course, defaults.movie, defaults.file, role, existing.id);
    return;
  }

  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO storage_sources (name, type, path, course_path, movie_path, file_path, role, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, type, sourcePath, defaults.course, defaults.movie, defaults.file, role, status, timestamp, timestamp);
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

ensureDefaultSource(
  "notebook",
  "Notebook Principal",
  MEDIA_DEFAULT_PATH,
  existsSync(MEDIA_DEFAULT_PATH) ? "active" : "disconnected",
  NOTEBOOK_DEFAULT_CATEGORY_PATHS,
);
ensureDefaultSource(
  "pendrive",
  "Pendrive",
  PENDRIVE_DEFAULT_PATH,
  existsSync(PENDRIVE_DEFAULT_PATH) ? "connected" : "disconnected",
  PENDRIVE_DEFAULT_CATEGORY_PATHS,
);
ensureDefaultSource(
  "google_drive",
  "Google Drive",
  GOOGLE_DRIVE_DEFAULT_PATH,
  "disconnected",
  { course: "", movie: "", file: "" },
  "primary",
);

export function getNowIso() {
  return nowIso();
}
