export type ContentType = "course" | "movie" | "file";

export type StorageType = "notebook" | "pendrive" | "google_drive";

export type MediaStatus =
  | "available_local"
  | "available_pendrive"
  | "available_drive"
  | "downloading"
  | "offline_ready"
  | "missing"
  | "pendrive_disconnected"
  | "error";

export interface MediaItem {
  id: string;
  contentId: string;
  title: string;
  duration: string;
  progress: number;
  storage: StorageType;
  localStorage?: Exclude<StorageType, "google_drive"> | null;
  status: MediaStatus;
  isOffline: boolean;
  driveFileId?: string | null;
  fileType?: string;
}

export interface MediaContent {
  id: string;
  title: string;
  type: ContentType;
  description: string;
  thumbnail: string;
  genre?: string;
  collection?: string;
  collectionOrder?: number | null;
  year?: number | null;
  releaseDate?: string;
  coverPath?: string;
  hasCover?: boolean;
  duration?: string;
  fileType?: string;
  progress: number;
  storage: StorageType;
  localStorage?: Exclude<StorageType, "google_drive"> | null;
  status: MediaStatus;
  isOffline: boolean;
  driveFileId?: string | null;
  driveWebViewLink?: string | null;
  category: string;
  addedAt: string;
  fileName?: string;
  filePath?: string;
  localFilePath?: string;
  sourceName?: string;
  sourcePath?: string;
  mimeType?: string;
  sizeBytes?: number;
  subtitlePath?: string;
  items?: MediaItem[];
}

export interface StorageSource {
  id: string;
  name: string;
  type: StorageType;
  path: string;
  status: "active" | "connected" | "disconnected" | "syncing";
  role?: "primary" | "offline";
  usedSpaceGb: number;
  totalSpaceGb: number;
  lastSyncAt: string;
}

export interface DownloadItem {
  id: string;
  contentId: string;
  title: string;
  source: StorageType;
  destination: StorageType;
  progress: number;
  status: "queued" | "downloading" | "paused" | "completed" | "failed" | "cancelled";
  size: string;
  speed?: string;
}
