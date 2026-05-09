const VIDEO_EXTENSIONS = [
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
];
const DOCUMENT_EXTENSIONS = [".pdf"];
const ARCHIVE_EXTENSIONS = [".zip"];
const COVER_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

export const SUPPORTED_EXTENSIONS = [...VIDEO_EXTENSIONS, ...DOCUMENT_EXTENSIONS, ...ARCHIVE_EXTENSIONS];

export function isSupportedExtension(extension) {
  return SUPPORTED_EXTENSIONS.includes(extension.toLowerCase());
}

export function isVideoExtension(extension) {
  return VIDEO_EXTENSIONS.includes(extension.toLowerCase());
}

export function isCoverImageExtension(extension) {
  return COVER_IMAGE_EXTENSIONS.includes(extension.toLowerCase());
}

export function getMimeType(extension) {
  const normalized = extension.toLowerCase();

  switch (normalized) {
    case ".mp4":
      return "video/mp4";
    case ".mkv":
      return "video/x-matroska";
    case ".avi":
      return "video/x-msvideo";
    case ".mov":
      return "video/quicktime";
    case ".webm":
      return "video/webm";
    case ".m4v":
      return "video/mp4";
    case ".mpg":
    case ".mpeg":
      return "video/mpeg";
    case ".m2ts":
    case ".mts":
    case ".ts":
      return "video/mp2t";
    case ".wmv":
      return "video/x-ms-wmv";
    case ".flv":
      return "video/x-flv";
    case ".ogv":
      return "video/ogg";
    case ".ogg":
      return "video/ogg";
    case ".3gp":
      return "video/3gpp";
    case ".3g2":
      return "video/3gpp2";
    case ".divx":
      return "video/divx";
    case ".pdf":
      return "application/pdf";
    case ".zip":
      return "application/zip";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

export function getStatusByStorageType(storageType) {
  switch (storageType) {
    case "notebook":
      return "available_local";
    case "pendrive":
      return "available_pendrive";
    case "google_drive":
      return "available_drive";
    default:
      return "available_local";
  }
}
