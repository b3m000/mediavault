import { existsSync } from "node:fs";
import { db, getNowIso } from "./db.js";
import { GOOGLE_DRIVE_TOKEN_PATH, getDefaultCategoryPaths, normalizePath } from "./config.js";

const CONTENT_TYPES = ["course", "movie", "file"];
const PATH_COLUMNS = {
  course: "course_path",
  movie: "movie_path",
  file: "file_path",
};

function getStorageRow(type) {
  return db.prepare("SELECT * FROM storage_sources WHERE type = ?").get(type);
}

function getCategoryPath(source, contentType) {
  return normalizePath(source?.[PATH_COLUMNS[contentType]] ?? "");
}

function normalizeCategoryPaths({ sourcePath, existingSource, categoryPaths }) {
  const defaults = getDefaultCategoryPaths(sourcePath);

  return CONTENT_TYPES.reduce((result, contentType) => {
    const provided = categoryPaths?.[contentType];
    const existing = getCategoryPath(existingSource, contentType);
    const fallback = defaults[contentType];
    result[contentType] = normalizePath(provided ?? existing ?? fallback);
    return result;
  }, {});
}

function isSourcePathAvailable(sourcePath, categoryPaths) {
  const configuredPaths = [sourcePath, ...CONTENT_TYPES.map((contentType) => categoryPaths[contentType])].filter(Boolean);
  return configuredPaths.some((configuredPath) => existsSync(configuredPath));
}

function resolveStatus(type, sourcePath, categoryPaths) {
  if (type === "google_drive") {
    return getStorageRow("google_drive")?.status ?? "disconnected";
  }

  const isPathAvailable = isSourcePathAvailable(sourcePath, categoryPaths);

  if (type === "notebook") {
    return isPathAvailable ? "active" : "disconnected";
  }

  return isPathAvailable ? "connected" : "disconnected";
}

export function upsertStorageSource({ type, name, sourcePath, categoryPaths }) {
  const normalizedPath = normalizePath(sourcePath);

  if (!normalizedPath) {
    throw new Error("Caminho inválido para armazenamento.");
  }

  const existing = getStorageRow(type);
  const normalizedCategoryPaths = normalizeCategoryPaths({
    sourcePath: normalizedPath,
    existingSource: existing,
    categoryPaths,
  });
  const nowIso = getNowIso();
  const status = resolveStatus(type, normalizedPath, normalizedCategoryPaths);

  db.prepare(`
    INSERT INTO storage_sources (name, type, path, course_path, movie_path, file_path, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(type) DO UPDATE SET
      name = excluded.name,
      path = excluded.path,
      course_path = excluded.course_path,
      movie_path = excluded.movie_path,
      file_path = excluded.file_path,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).run(
    name,
    type,
    normalizedPath,
    normalizedCategoryPaths.course,
    normalizedCategoryPaths.movie,
    normalizedCategoryPaths.file,
    status,
    nowIso,
    nowIso,
  );

  return getStorageRow(type);
}

export function upsertStorageContentPaths({ type, categoryPaths }) {
  const existing = getStorageRow(type);
  if (!existing) {
    throw new Error("Fonte de armazenamento não encontrada.");
  }

  const normalizedCategoryPaths = normalizeCategoryPaths({
    sourcePath: existing.path,
    existingSource: existing,
    categoryPaths,
  });

  const missingPathType = CONTENT_TYPES.find((contentType) => !normalizedCategoryPaths[contentType]);
  if (missingPathType) {
    throw new Error("Todos os caminhos por categoria devem ser preenchidos.");
  }

  const nowIso = getNowIso();
  const status = resolveStatus(type, existing.path, normalizedCategoryPaths);

  db.prepare(`
    UPDATE storage_sources
    SET course_path = ?, movie_path = ?, file_path = ?, status = ?, updated_at = ?
    WHERE type = ?
  `).run(
    normalizedCategoryPaths.course,
    normalizedCategoryPaths.movie,
    normalizedCategoryPaths.file,
    status,
    nowIso,
    type,
  );

  return getStorageRow(type);
}

export function refreshStorageStatus() {
  const nowIso = getNowIso();
  const sources = db.prepare("SELECT * FROM storage_sources").all();

  for (const source of sources) {
    if (source.type === "google_drive") {
      const status = existsSync(GOOGLE_DRIVE_TOKEN_PATH) ? "connected" : "disconnected";
      if (source.status !== "syncing") {
        db.prepare("UPDATE storage_sources SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso, source.id);
      }
      continue;
    }

    const categoryPaths = normalizeCategoryPaths({
      sourcePath: source.path,
      existingSource: source,
    });
    const connected = isSourcePathAvailable(source.path, categoryPaths);
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
