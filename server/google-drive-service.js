import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { authenticate } from "@google-cloud/local-auth";
import { google } from "googleapis";
import {
  GOOGLE_DRIVE_CREDENTIALS_PATH,
  GOOGLE_DRIVE_DEFAULT_PATH,
  GOOGLE_DRIVE_TOKEN_PATH,
  SERVER_DATA_DIR,
  normalizePath,
} from "./config.js";
import { getMimeType, isSupportedExtension } from "./constants.js";
import { db, getNowIso } from "./db.js";

const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];
const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const CONTENT_TYPES = ["course", "movie", "file"];
const PATH_COLUMNS = {
  course: "course_path",
  movie: "movie_path",
  file: "file_path",
};

function ensureDataDirectory() {
  return mkdir(SERVER_DATA_DIR, { recursive: true });
}

function getDriveSource() {
  return db.prepare("SELECT * FROM storage_sources WHERE type = 'google_drive'").get();
}

function ensureDriveSource() {
  const existing = getDriveSource();
  if (existing) {
    return existing;
  }

  const nowIso = getNowIso();
  db.prepare(`
    INSERT INTO storage_sources (name, type, path, course_path, movie_path, file_path, role, status, created_at, updated_at)
    VALUES ('Google Drive', 'google_drive', ?, '', '', '', 'primary', 'disconnected', ?, ?)
  `).run(GOOGLE_DRIVE_DEFAULT_PATH, nowIso, nowIso);

  return getDriveSource();
}

function getConfiguredFolders(source = ensureDriveSource()) {
  return {
    course: source.course_path ?? "",
    movie: source.movie_path ?? "",
    file: source.file_path ?? "",
  };
}

function normalizeDriveFolderId(input) {
  const rawValue = String(input ?? "").trim();
  if (!rawValue) {
    return "";
  }

  try {
    const url = new URL(rawValue);
    const folderMatch = url.pathname.match(/\/folders\/([^/?#]+)/);
    if (folderMatch?.[1]) {
      return decodeURIComponent(folderMatch[1]);
    }

    const idParam = url.searchParams.get("id");
    if (idParam) {
      return idParam;
    }
  } catch {
    // Plain folder IDs are expected too.
  }

  return rawValue.replace(/^drive:\/\//, "").replace(/^folders\//, "").replace(/\/+$/, "");
}

function escapeDriveQueryValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function readCredentialsFile() {
  if (!existsSync(GOOGLE_DRIVE_CREDENTIALS_PATH)) {
    throw new Error(`Arquivo de credenciais do Google Drive não encontrado: ${GOOGLE_DRIVE_CREDENTIALS_PATH}`);
  }

  const raw = await readFile(GOOGLE_DRIVE_CREDENTIALS_PATH, "utf8");
  const keyFile = JSON.parse(raw);
  const keys = keyFile.installed || keyFile.web;

  if (!keys?.client_id || !keys?.client_secret || !keys?.redirect_uris?.length) {
    throw new Error("Credenciais do Google Drive inválidas. Use um OAuth Client do tipo Desktop app.");
  }

  return keys;
}

async function createOAuthClientFromSavedToken() {
  const keys = await readCredentialsFile();
  if (!existsSync(GOOGLE_DRIVE_TOKEN_PATH)) {
    throw new Error("Google Drive ainda não está autenticado.");
  }

  const token = JSON.parse(await readFile(GOOGLE_DRIVE_TOKEN_PATH, "utf8"));
  const client = new google.auth.OAuth2(keys.client_id, keys.client_secret, keys.redirect_uris[0]);
  client.setCredentials(token);
  return client;
}

async function getDriveClient() {
  const auth = await createOAuthClientFromSavedToken();
  return google.drive({ version: "v3", auth });
}

function getFileExtension(file) {
  const extensionFromName = path.extname(file.name ?? "").toLowerCase();
  if (extensionFromName) {
    return extensionFromName;
  }

  return file.fileExtension ? `.${String(file.fileExtension).toLowerCase()}` : "";
}

function toDisplayTitle(fileName) {
  return String(fileName)
    .replace(/\.[^/.]+$/, "")
    .replace(/[._-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

async function listDriveChildren({ drive, folderId }) {
  const files = [];
  let pageToken;

  do {
    const response = await drive.files.list({
      q: `'${escapeDriveQueryValue(folderId)}' in parents and trashed = false`,
      pageSize: 1000,
      pageToken,
      fields:
        "nextPageToken, files(id, name, mimeType, size, modifiedTime, md5Checksum, webViewLink, webContentLink, fileExtension)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    files.push(...(response.data.files ?? []));
    pageToken = response.data.nextPageToken;
  } while (pageToken);

  return files;
}

async function walkDriveFolder({ drive, folderId, contentType }) {
  const queue = [{ folderId, segments: [] }];
  const files = [];

  while (queue.length > 0) {
    const current = queue.shift();
    const children = await listDriveChildren({ drive, folderId: current.folderId });

    for (const child of children) {
      if (child.mimeType === DRIVE_FOLDER_MIME_TYPE) {
        queue.push({ folderId: child.id, segments: [...current.segments, child.name] });
        continue;
      }

      const extension = getFileExtension(child);
      if (!isSupportedExtension(extension)) {
        continue;
      }

      files.push({
        ...child,
        contentType,
        extension,
        relativePath: [...current.segments, child.name].filter(Boolean).join("/"),
      });
    }
  }

  return files;
}

function upsertDriveFile({ source, file, nowIso }) {
  const sizeBytes = Number(file.size ?? 0);
  const filePath = `drive://${file.id}`;
  const title = toDisplayTitle(file.name);

  db.prepare(`
    INSERT INTO media_items (
      id,
      title,
      file_name,
      file_path,
      extension,
      mime_type,
      content_type,
      drive_file_id,
      drive_web_view_link,
      drive_web_content_link,
      drive_modified_time,
      checksum,
      size_bytes,
      storage_type,
      source_id,
      is_offline,
      status,
      created_at,
      updated_at,
      last_seen_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'google_drive', ?, 0, 'available_drive', ?, ?, ?)
    ON CONFLICT(file_path) DO UPDATE SET
      file_name = excluded.file_name,
      extension = excluded.extension,
      mime_type = excluded.mime_type,
      content_type = excluded.content_type,
      drive_file_id = excluded.drive_file_id,
      drive_web_view_link = excluded.drive_web_view_link,
      drive_web_content_link = excluded.drive_web_content_link,
      drive_modified_time = excluded.drive_modified_time,
      checksum = excluded.checksum,
      size_bytes = excluded.size_bytes,
      storage_type = 'google_drive',
      source_id = excluded.source_id,
      is_offline = CASE
        WHEN media_items.local_file_path IS NOT NULL AND media_items.local_file_path != '' THEN 1
        ELSE 0
      END,
      status = CASE
        WHEN media_items.local_file_path IS NOT NULL AND media_items.local_file_path != '' THEN 'offline_ready'
        ELSE 'available_drive'
      END,
      updated_at = excluded.updated_at,
      last_seen_at = excluded.last_seen_at
  `).run(
    `drive-${file.id}`,
    title,
    file.name,
    filePath,
    file.extension,
    getMimeType(file.extension),
    file.contentType,
    file.id,
    file.webViewLink ?? null,
    file.webContentLink ?? null,
    file.modifiedTime ?? null,
    file.md5Checksum ?? null,
    sizeBytes,
    source.id,
    nowIso,
    nowIso,
    nowIso,
  );
}

function markMissingDriveFiles({ source, seenDriveFileIds, nowIso }) {
  const rows = db.prepare("SELECT id, drive_file_id, local_file_path FROM media_items WHERE source_id = ? AND drive_file_id IS NOT NULL").all(
    source.id,
  );
  const updateStatement = db.prepare("UPDATE media_items SET status = ?, is_offline = ?, updated_at = ? WHERE id = ?");

  for (const row of rows) {
    if (seenDriveFileIds.has(row.drive_file_id)) {
      continue;
    }

    const hasLocalCopy = Boolean(row.local_file_path && existsSync(row.local_file_path));
    updateStatement.run(hasLocalCopy ? "offline_ready" : "missing", hasLocalCopy ? 1 : 0, nowIso, row.id);
  }
}

export function getGoogleDriveStatus() {
  const source = ensureDriveSource();
  const connected = existsSync(GOOGLE_DRIVE_TOKEN_PATH);
  if (connected && source.status === "disconnected") {
    db.prepare("UPDATE storage_sources SET status = 'connected', updated_at = ? WHERE id = ?").run(getNowIso(), source.id);
    source.status = "connected";
  }
  const folders = getConfiguredFolders(source);

  return {
    connected,
    credentialsPresent: existsSync(GOOGLE_DRIVE_CREDENTIALS_PATH),
    credentialsPath: GOOGLE_DRIVE_CREDENTIALS_PATH,
    tokenPath: GOOGLE_DRIVE_TOKEN_PATH,
    scopes: DRIVE_SCOPES,
    folders,
    source,
  };
}

export async function authenticateGoogleDrive() {
  await ensureDataDirectory();

  const auth = await authenticate({
    keyfilePath: GOOGLE_DRIVE_CREDENTIALS_PATH,
    scopes: DRIVE_SCOPES,
  });

  await writeFile(GOOGLE_DRIVE_TOKEN_PATH, JSON.stringify(auth.credentials, null, 2), "utf8");

  const nowIso = getNowIso();
  db.prepare("UPDATE storage_sources SET status = 'connected', updated_at = ? WHERE type = 'google_drive'").run(nowIso);

  return getGoogleDriveStatus();
}

export async function disconnectGoogleDrive() {
  if (existsSync(GOOGLE_DRIVE_TOKEN_PATH)) {
    await unlink(GOOGLE_DRIVE_TOKEN_PATH);
  }

  const nowIso = getNowIso();
  db.prepare("UPDATE storage_sources SET status = 'disconnected', updated_at = ? WHERE type = 'google_drive'").run(nowIso);

  return getGoogleDriveStatus();
}

export function configureGoogleDriveFolders(folderInput) {
  const source = ensureDriveSource();
  const currentFolders = getConfiguredFolders(source);
  const nextFolders = CONTENT_TYPES.reduce((result, contentType) => {
    result[contentType] = normalizeDriveFolderId(folderInput?.[contentType] ?? currentFolders[contentType]);
    return result;
  }, {});

  const nowIso = getNowIso();
  db.prepare(`
    UPDATE storage_sources
    SET course_path = ?, movie_path = ?, file_path = ?, path = ?, role = 'primary', updated_at = ?
    WHERE type = 'google_drive'
  `).run(nextFolders.course, nextFolders.movie, nextFolders.file, GOOGLE_DRIVE_DEFAULT_PATH, nowIso);

  return getGoogleDriveStatus();
}

export async function syncGoogleDriveLibrary() {
  const source = ensureDriveSource();
  const folders = getConfiguredFolders(source);
  const missingContentType = CONTENT_TYPES.find((contentType) => !folders[contentType]);

  if (missingContentType) {
    throw new Error("Configure as pastas do Google Drive para Cursos, Filmes e Arquivos antes de sincronizar.");
  }

  const drive = await getDriveClient();
  const nowIso = getNowIso();
  const seenDriveFileIds = new Set();
  const syncedByType = {
    course: 0,
    movie: 0,
    file: 0,
  };

  db.prepare("UPDATE storage_sources SET status = 'syncing', updated_at = ? WHERE id = ?").run(nowIso, source.id);

  try {
    for (const contentType of CONTENT_TYPES) {
      const files = await walkDriveFolder({ drive, folderId: folders[contentType], contentType });

      for (const file of files) {
        upsertDriveFile({ source, file, nowIso });
        seenDriveFileIds.add(file.id);
        syncedByType[contentType] += 1;
      }
    }

    markMissingDriveFiles({ source, seenDriveFileIds, nowIso });

    db.prepare("UPDATE storage_sources SET status = 'connected', last_scan_at = ?, updated_at = ? WHERE id = ?").run(
      nowIso,
      nowIso,
      source.id,
    );
  } catch (error) {
    db.prepare("UPDATE storage_sources SET status = 'connected', updated_at = ? WHERE id = ?").run(getNowIso(), source.id);
    throw error;
  }

  return {
    sourceId: source.id,
    sourceType: "google_drive",
    syncedFiles: seenDriveFileIds.size,
    syncedByType,
    folders,
  };
}

export async function downloadDriveFileToPath({ driveFileId, destinationPath, onProgress }) {
  const drive = await getDriveClient();
  await mkdir(path.dirname(destinationPath), { recursive: true });

  const response = await drive.files.get(
    { fileId: driveFileId, alt: "media", supportsAllDrives: true },
    { responseType: "stream" },
  );
  let copiedBytes = 0;

  response.data.on("data", (chunk) => {
    copiedBytes += chunk.length;
    onProgress?.(copiedBytes);
  });

  await pipeline(response.data, createWriteStream(destinationPath));
  return copiedBytes;
}

export async function streamDriveFile({ driveFileId, rangeHeader }) {
  const drive = await getDriveClient();

  const response = await drive.files.get(
    { fileId: driveFileId, alt: "media", supportsAllDrives: true },
    {
      responseType: "stream",
      headers: rangeHeader ? { Range: rangeHeader } : undefined,
    },
  );

  return {
    stream: response.data,
    headers: response.headers ?? {},
    status: response.status,
  };
}

export function getGoogleDriveContentPath(contentType) {
  const source = ensureDriveSource();
  return normalizePath(source?.[PATH_COLUMNS[contentType]] ?? "");
}
