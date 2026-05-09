import path from "node:path";

export const SERVER_PORT = Number(process.env.MEDIAVAULT_SERVER_PORT ?? 8787);
export const SERVER_DATA_DIR = path.join(process.cwd(), "server", "data");
export const MEDIA_DEFAULT_PATH = normalizePath(process.env.MEDIAVAULT_NOTEBOOK_PATH ?? "C:/MediaVault");
export const PENDRIVE_DEFAULT_PATH = normalizePath(process.env.MEDIAVAULT_PENDRIVE_PATH ?? "E:/MediaVault");
export const GOOGLE_DRIVE_DEFAULT_PATH = "Google Drive";
export const GOOGLE_DRIVE_CREDENTIALS_PATH = normalizePath(
  process.env.MEDIAVAULT_GOOGLE_CREDENTIALS_PATH ?? path.join(SERVER_DATA_DIR, "google-credentials.json"),
);
export const GOOGLE_DRIVE_TOKEN_PATH = normalizePath(
  process.env.MEDIAVAULT_GOOGLE_TOKEN_PATH ?? path.join(SERVER_DATA_DIR, "google-token.json"),
);
export const DB_PATH = path.join(SERVER_DATA_DIR, "mediavault.db");

export const CONTENT_TYPE_FOLDERS = {
  course: "Cursos",
  movie: "Filmes",
  file: "Arquivos",
};

export function normalizePath(inputPath) {
  if (!inputPath || typeof inputPath !== "string") {
    return "";
  }

  return inputPath.trim().replace(/\\+/g, "/");
}

function joinStoragePath(rootPath, folderName) {
  return normalizePath(path.posix.join(normalizePath(rootPath), folderName));
}

export function getDefaultCategoryPaths(rootPath) {
  return {
    course: joinStoragePath(rootPath, CONTENT_TYPE_FOLDERS.course),
    movie: joinStoragePath(rootPath, CONTENT_TYPE_FOLDERS.movie),
    file: joinStoragePath(rootPath, CONTENT_TYPE_FOLDERS.file),
  };
}

export const NOTEBOOK_DEFAULT_CATEGORY_PATHS = {
  course: normalizePath(process.env.MEDIAVAULT_NOTEBOOK_COURSES_PATH ?? getDefaultCategoryPaths(MEDIA_DEFAULT_PATH).course),
  movie: normalizePath(process.env.MEDIAVAULT_NOTEBOOK_MOVIES_PATH ?? getDefaultCategoryPaths(MEDIA_DEFAULT_PATH).movie),
  file: normalizePath(process.env.MEDIAVAULT_NOTEBOOK_FILES_PATH ?? getDefaultCategoryPaths(MEDIA_DEFAULT_PATH).file),
};

export const PENDRIVE_DEFAULT_CATEGORY_PATHS = {
  course: normalizePath(process.env.MEDIAVAULT_PENDRIVE_COURSES_PATH ?? getDefaultCategoryPaths(PENDRIVE_DEFAULT_PATH).course),
  movie: normalizePath(process.env.MEDIAVAULT_PENDRIVE_MOVIES_PATH ?? getDefaultCategoryPaths(PENDRIVE_DEFAULT_PATH).movie),
  file: normalizePath(process.env.MEDIAVAULT_PENDRIVE_FILES_PATH ?? getDefaultCategoryPaths(PENDRIVE_DEFAULT_PATH).file),
};
