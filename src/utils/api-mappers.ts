import type { ApiMediaItem } from "../api/client";
import type { ContentType, MediaContent, MediaStatus, StorageType } from "../types/content";

function normalizeStatus(status: string): MediaStatus {
  const allowed: MediaStatus[] = [
    "available_local",
    "available_pendrive",
    "available_drive",
    "downloading",
    "offline_ready",
    "missing",
    "pendrive_disconnected",
    "error",
  ];

  return allowed.includes(status as MediaStatus) ? (status as MediaStatus) : "available_local";
}

function mapStorage(storageType: ApiMediaItem["storageType"]): StorageType {
  return storageType;
}

function mapType(contentType: ApiMediaItem["contentType"]): ContentType {
  return contentType;
}

export function toMediaContent(item: ApiMediaItem): MediaContent {
  return {
    id: item.id,
    title: item.title,
    type: mapType(item.contentType),
    description: item.description,
    thumbnail: item.thumbnail,
    genre: item.genre,
    collection: item.collection,
    collectionOrder: item.collectionOrder,
    year: item.year,
    releaseDate: item.releaseDate,
    coverPath: item.coverPath,
    hasCover: item.hasCover,
    duration: item.durationLabel,
    fileType: item.extension,
    progress: item.progress.percentage,
    storage: mapStorage(item.storageType),
    localStorage: item.localStorageType,
    status: normalizeStatus(item.status),
    isOffline: item.isOffline,
    driveFileId: item.driveFileId,
    driveWebViewLink: item.driveWebViewLink,
    category: item.category,
    addedAt: item.createdAt,
    fileName: item.fileName,
    filePath: item.filePath,
    localFilePath: item.localFilePath,
    sourceName: item.sourceName,
    sourcePath: item.sourcePath,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    subtitlePath: item.subtitlePath,
  };
}

export function formatDateForUi(isoDate: string | null | undefined): string {
  if (!isoDate) {
    return "--";
  }

  const value = new Date(isoDate);
  if (Number.isNaN(value.getTime())) {
    return "--";
  }

  return value.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
