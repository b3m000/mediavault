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
  status: MediaStatus;
  isOffline: boolean;
  fileType?: string;
}

export interface MediaContent {
  id: string;
  title: string;
  type: ContentType;
  description: string;
  thumbnail: string;
  duration?: string;
  fileType?: string;
  progress: number;
  storage: StorageType;
  status: MediaStatus;
  isOffline: boolean;
  category: string;
  addedAt: string;
  items?: MediaItem[];
}

export interface StorageSource {
  id: string;
  name: string;
  type: StorageType;
  path: string;
  status: "active" | "connected" | "disconnected" | "syncing";
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
