import path from "node:path";
import { normalizePath } from "./config.js";

export const CONTENT_TYPES = ["course", "movie", "file"];

const COURSE_HINTS = ["curso", "cursos", "course", "courses", "aula", "aulas", "modulo", "módulo", "lesson", "lessons"];
const MOVIE_HINTS = ["filme", "filmes", "movie", "movies", "cinema", "films"];
const FILE_HINTS = ["arquivo", "arquivos", "file", "files", "documento", "documentos", "pdf", "zip"];
const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mkv",
  ".avi",
  ".mov",
  ".webm",
  ".m4v",
  ".mpg",
  ".mpeg",
  ".m2ts",
  ".mts",
  ".ts",
  ".wmv",
  ".flv",
  ".ogv",
  ".ogg",
  ".3gp",
  ".3g2",
  ".divx",
]);
const PATH_COLUMNS = {
  course: "course_path",
  movie: "movie_path",
  file: "file_path",
};

function normalize(input) {
  return String(input ?? "").toLowerCase();
}

function normalizePathLike(value) {
  return normalizePath(String(value ?? ""));
}

function normalizePathForCompare(value) {
  return normalizePathLike(value).toLowerCase();
}

function toTitleCase(input) {
  const trimmed = input.trim();
  if (!trimmed) {
    return "Geral";
  }

  return trimmed
    .split(/[-_ .]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function resolveRelativePath(filePath, sourcePath) {
  const normalizedFilePath = normalizePathLike(filePath);
  const normalizedSourcePath = normalizePathLike(sourcePath);

  if (!normalizedSourcePath) {
    return normalizedFilePath;
  }

  const relativeRaw = path.posix.relative(normalizedSourcePath, normalizedFilePath);
  return relativeRaw.startsWith("../") || relativeRaw === ".." ? normalizedFilePath : relativeRaw;
}

function pathSegmentsForClassification({ filePath, sourcePath }) {
  const relativePath = resolveRelativePath(filePath, sourcePath);
  return relativePath.split("/").filter(Boolean).map((segment) => normalize(segment));
}

function hasHint(segments, hints) {
  return segments.some((segment) => hints.some((hint) => segment.includes(hint)));
}

function isKnownContentType(contentType) {
  return CONTENT_TYPES.includes(contentType);
}

export function isPathInsideDirectory(filePath, directoryPath) {
  const normalizedFilePath = normalizePathForCompare(filePath);
  const normalizedDirectoryPath = normalizePathForCompare(directoryPath);

  if (!normalizedFilePath || !normalizedDirectoryPath) {
    return false;
  }

  const relativePath = path.posix.relative(normalizedDirectoryPath, normalizedFilePath);
  return relativePath === "" || (!relativePath.startsWith("../") && relativePath !== ".." && !path.posix.isAbsolute(relativePath));
}

export function getSourceContentPath(source, contentType) {
  if (!isKnownContentType(contentType)) {
    return "";
  }

  return normalizePathLike(source?.[PATH_COLUMNS[contentType]] ?? "");
}

export function getSourceContentPaths(source) {
  return CONTENT_TYPES.map((contentType) => ({
    contentType,
    path: getSourceContentPath(source, contentType),
  })).filter((target) => Boolean(target.path));
}

export function resolveSourcePathForContent({ filePath, source, contentType }) {
  const configuredPath = getSourceContentPath(source, contentType);
  if (configuredPath && isPathInsideDirectory(filePath, configuredPath)) {
    return configuredPath;
  }

  return normalizePathLike(source?.path ?? "");
}

export function resolveContentType({ extension, filePath, sourcePath, source, preferredContentType }) {
  const normalizedExtension = normalize(extension);

  if (!VIDEO_EXTENSIONS.has(normalizedExtension)) {
    return "file";
  }

  if (isKnownContentType(preferredContentType)) {
    return preferredContentType;
  }

  for (const target of getSourceContentPaths(source)) {
    if (isPathInsideDirectory(filePath, target.path)) {
      return target.contentType;
    }
  }

  const segments = pathSegmentsForClassification({ filePath, sourcePath });

  if (hasHint(segments, MOVIE_HINTS)) {
    return "movie";
  }

  if (hasHint(segments, COURSE_HINTS)) {
    return "course";
  }

  if (hasHint(segments, FILE_HINTS)) {
    return "file";
  }

  return "movie";
}

export function resolveCategory({ filePath, sourcePath, extension, contentType }) {
  const relativePath = resolveRelativePath(filePath, sourcePath);
  const segments = relativePath.split("/").filter(Boolean);

  if (segments.length >= 2) {
    return toTitleCase(segments[0]);
  }

  if (contentType === "course") {
    return "Cursos";
  }

  if (contentType === "movie") {
    return "Filmes";
  }

  if (segments.length === 1) {
    return toTitleCase(path.parse(segments[0]).ext.replace(".", "") || extension.replace(".", "") || "Geral");
  }

  return "Geral";
}

export function resolveThumbnail(contentType) {
  switch (contentType) {
    case "course":
      return "/thumbnails/default-course.svg";
    case "movie":
      return "/thumbnails/default-movie.svg";
    case "file":
      return "/thumbnails/default-file.svg";
    default:
      return "/thumbnails/default-file.svg";
  }
}

export function formatDurationFromSeconds(secondsValue) {
  const totalSeconds = Number(secondsValue ?? 0);
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "--";
  }

  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h${String(minutes).padStart(2, "0")}`;
  }

  return `${minutes}min`;
}

export function bytesToSizeLabel(bytesValue) {
  const bytes = Number(bytesValue ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const decimals = unitIndex <= 1 ? 0 : 2;
  return `${size.toFixed(decimals)} ${units[unitIndex]}`;
}
