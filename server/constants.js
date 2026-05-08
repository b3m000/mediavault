const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".avi", ".mov"];
const DOCUMENT_EXTENSIONS = [".pdf"];
const ARCHIVE_EXTENSIONS = [".zip"];

export const SUPPORTED_EXTENSIONS = [...VIDEO_EXTENSIONS, ...DOCUMENT_EXTENSIONS, ...ARCHIVE_EXTENSIONS];

export function isSupportedExtension(extension) {
  return SUPPORTED_EXTENSIONS.includes(extension.toLowerCase());
}

export function isVideoExtension(extension) {
  return VIDEO_EXTENSIONS.includes(extension.toLowerCase());
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
    case ".pdf":
      return "application/pdf";
    case ".zip":
      return "application/zip";
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
