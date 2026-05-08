import path from "node:path";

const COURSE_HINTS = ["curso", "cursos", "course", "courses", "aula", "aulas"];
const MOVIE_HINTS = ["filme", "filmes", "movie", "movies", "cinema"];
const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".avi", ".mov"]);

function normalize(input) {
  return String(input ?? "").toLowerCase();
}

function normalizePathLike(value) {
  return String(value ?? "").replace(/\\/g, "/");
}

function toTitleCase(input) {
  const trimmed = input.trim();
  if (!trimmed) {
    return "Geral";
  }

  return trimmed
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function resolveRelativePath(filePath, sourcePath) {
  const normalizedFilePath = normalizePathLike(filePath);
  const normalizedSourcePath = normalizePathLike(sourcePath);

  const relativeRaw = path.posix.relative(normalizedSourcePath, normalizedFilePath);
  return relativeRaw.startsWith("../") ? normalizedFilePath : relativeRaw;
}

export function resolveContentType({ extension, filePath, sourcePath }) {
  const normalizedExtension = normalize(extension);
  const relativePath = resolveRelativePath(filePath, sourcePath);
  const firstSegment = normalize(relativePath.split("/")[0] ?? "");

  if (VIDEO_EXTENSIONS.has(normalizedExtension)) {
    if (MOVIE_HINTS.some((hint) => firstSegment.includes(hint))) {
      return "movie";
    }

    if (COURSE_HINTS.some((hint) => firstSegment.includes(hint))) {
      return "course";
    }

    return "course";
  }

  return "file";
}

export function resolveCategory({ filePath, sourcePath, extension }) {
  const relativePath = resolveRelativePath(filePath, sourcePath);
  const segments = relativePath.split("/").filter(Boolean);

  if (segments.length >= 2) {
    return toTitleCase(segments[0]);
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
