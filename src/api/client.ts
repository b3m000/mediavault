const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787";
const API_BASE_URL_STORAGE_KEY = "mediavault.apiBaseUrl";

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: { message?: string };
}

export function getApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return DEFAULT_API_BASE_URL;
  }

  const storedValue = window.localStorage.getItem(API_BASE_URL_STORAGE_KEY)?.trim();
  return (storedValue || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
}

export function setApiBaseUrlPreference(value: string): void {
  const normalized = value.trim().replace(/\/+$/, "");

  if (!normalized || normalized === DEFAULT_API_BASE_URL) {
    window.localStorage.removeItem(API_BASE_URL_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(API_BASE_URL_STORAGE_KEY, normalized);
}

async function requestJson<T>(endpoint: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  let payload: ApiResponse<T>;

  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new Error(response.ok ? `Resposta inválida da API em ${endpoint}` : `Falha na requisição ${endpoint}`);
  }

  if (!response.ok || !payload.success) {
    throw new Error(payload.error?.message ?? `Falha na requisição ${endpoint}`);
  }

  return payload.data;
}

export interface ApiStorageContentPaths {
  course: string;
  movie: string;
  file: string;
}

export interface ApiStorageSource {
  id: number;
  name: string;
  type: "notebook" | "pendrive" | "google_drive";
  path: string;
  status: "active" | "connected" | "disconnected" | "syncing";
  role?: "primary" | "offline";
  last_scan_at?: string | null;
  usedBytes?: number;
  contentPaths: ApiStorageContentPaths;
  contentPathStatus?: Record<keyof ApiStorageContentPaths, boolean>;
}

export interface ApiMediaItem {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  contentType: "course" | "movie" | "file";
  category: string;
  genre: string;
  collection: string;
  collectionOrder: number | null;
  year: number | null;
  releaseDate: string;
  coverPath: string;
  hasCover: boolean;
  durationLabel: string;
  fileName: string;
  filePath: string;
  localFilePath: string;
  sourceName: string;
  sourcePath: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  subtitlePath: string;
  storageType: "notebook" | "pendrive" | "google_drive";
  localStorageType: "notebook" | "pendrive" | null;
  driveFileId: string | null;
  driveWebViewLink: string | null;
  isOffline: boolean;
  status: string;
  progress: {
    currentTime: number;
    duration: number;
    percentage: number;
    completed: boolean;
    lastWatchedAt: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ApiPlayerItem {
  id: string;
  title: string;
  fileName: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  streamUrl: string;
  isOnlineStream: boolean;
  driveWebViewLink: string | null;
  subtitleTracks: ApiSubtitleTrack[];
  compatibility: {
    level: "high" | "medium" | "low";
    message: string;
    recommendedFormat: string;
  };
  progress: {
    currentTime: number;
    duration: number;
    percentage: number;
    completed: boolean;
    lastWatchedAt: string;
  } | null;
}

export interface ApiSubtitleTrack {
  id: string;
  label: string;
  lang: string;
  kind: "subtitles" | "captions";
  url: string;
  default?: boolean;
}

export interface ApiDownloadItem {
  id: string;
  mediaItemId: string;
  title: string;
  fileName: string;
  source: "notebook" | "pendrive" | "google_drive";
  destination: "notebook" | "pendrive" | "google_drive";
  sourcePath: string;
  destinationPath: string;
  status: "queued" | "downloading" | "paused" | "completed" | "failed" | "cancelled";
  progress: number;
  copiedBytes: number;
  sizeBytes: number;
  size: string;
  createdAt: string;
  completedAt: string | null;
  errorMessage?: string | null;
}

export interface ApiDriveStatus {
  connected: boolean;
  credentialsPresent: boolean;
  credentialsPath: string;
  tokenPath: string;
  scopes: string[];
  folders: ApiStorageContentPaths;
  source: ApiStorageSource;
}

export interface ApiDriveSyncReport {
  sourceId: number;
  sourceType: "google_drive";
  syncedFiles: number;
  syncedByType: Record<keyof ApiStorageContentPaths, number>;
  folders: ApiStorageContentPaths;
}

export interface ApiStorageClearReport {
  storageType: ApiStorageSource["type"];
  mode: "library_only" | "delete_files";
  requestedItems: number;
  removedFromLibrary: number;
  offlineCopiesCleared: number;
  deletedFiles: number;
  missingFiles: number;
  skippedFiles: number;
  failedFiles: Array<{
    id: string;
    title: string;
    fileName: string;
    path: string;
    message: string;
  }>;
}

export async function getStorageSources(): Promise<ApiStorageSource[]> {
  return requestJson<ApiStorageSource[]>("/api/storage");
}

export async function setNotebookSource(path: string, name = "Notebook Principal"): Promise<ApiStorageSource> {
  return requestJson<ApiStorageSource>("/api/storage/notebook", {
    method: "POST",
    body: JSON.stringify({ path, name }),
  });
}

export async function setPendriveSource(path: string, name = "Pendrive"): Promise<ApiStorageSource> {
  return requestJson<ApiStorageSource>("/api/storage/pendrive", {
    method: "POST",
    body: JSON.stringify({ path, name }),
  });
}

export async function setStoragePaths(
  storageType: "notebook" | "pendrive",
  contentPaths: ApiStorageContentPaths,
): Promise<ApiStorageSource> {
  return requestJson<ApiStorageSource>(`/api/storage/${storageType}/paths`, {
    method: "POST",
    body: JSON.stringify({ contentPaths }),
  });
}

export async function scanStorage(type: "all" | "notebook" | "pendrive" = "all") {
  return requestJson<Array<Record<string, unknown>>>("/api/storage/scan", {
    method: "POST",
    body: JSON.stringify({ type }),
  });
}

export async function clearStorageContent(input: {
  storageType: ApiStorageSource["type"];
  deleteFiles: boolean;
  confirmText: string;
}): Promise<ApiStorageClearReport> {
  return requestJson<ApiStorageClearReport>(`/api/storage/${input.storageType}/content`, {
    method: "DELETE",
    body: JSON.stringify({
      deleteFiles: input.deleteFiles,
      confirmText: input.confirmText,
    }),
  });
}

export async function getDriveStatus(): Promise<ApiDriveStatus> {
  return requestJson<ApiDriveStatus>("/api/drive/status");
}

export async function authenticateDrive(): Promise<ApiDriveStatus> {
  return requestJson<ApiDriveStatus>("/api/drive/auth", {
    method: "POST",
  });
}

export async function disconnectDrive(): Promise<ApiDriveStatus> {
  return requestJson<ApiDriveStatus>("/api/drive/disconnect", {
    method: "POST",
  });
}

export async function setDriveFolders(folders: ApiStorageContentPaths): Promise<ApiDriveStatus> {
  return requestJson<ApiDriveStatus>("/api/drive/folders", {
    method: "PUT",
    body: JSON.stringify({ folders }),
  });
}

export async function syncDrive(): Promise<ApiDriveSyncReport> {
  return requestJson<ApiDriveSyncReport>("/api/drive/sync", {
    method: "POST",
  });
}

export async function getLibrary(params?: {
  type?: string;
  offline?: boolean;
  search?: string;
  storage?: string;
  status?: string;
  cover?: "missing" | "present";
  metadata?: "missing_genre" | "missing_collection";
  format?: string;
}): Promise<ApiMediaItem[]> {
  const query = new URLSearchParams();

  if (params?.type) {
    query.set("type", params.type);
  }

  if (params?.offline) {
    query.set("offline", "true");
  }

  if (typeof params?.search === "string") {
    const searchValue = params.search.trim();
    if (searchValue) {
      query.set("q", searchValue);
    }
  }

  if (params?.storage) {
    query.set("storage", params.storage);
  }

  if (params?.status) {
    query.set("status", params.status);
  }

  if (params?.cover) {
    query.set("cover", params.cover);
  }

  if (params?.metadata) {
    query.set("metadata", params.metadata);
  }

  if (params?.format) {
    query.set("format", params.format);
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestJson<ApiMediaItem[]>(`/api/library${suffix}`);
}

export async function getPlayerItem(mediaItemId: string): Promise<ApiPlayerItem> {
  return requestJson<ApiPlayerItem>(`/api/player/${mediaItemId}`);
}

export async function getLibraryItem(mediaItemId: string): Promise<ApiMediaItem> {
  return requestJson<ApiMediaItem>(`/api/library/${mediaItemId}`);
}

export async function updateLibraryItem(
  mediaItemId: string,
  input: {
    title?: string;
    subtitlePath?: string;
    genre?: string;
    collection?: string;
    collectionOrder?: number | string | null;
    year?: number | string | null;
    releaseDate?: string;
    coverPath?: string;
  },
): Promise<ApiMediaItem> {
  return requestJson<ApiMediaItem>(`/api/library/${mediaItemId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function removeLibraryItem(mediaItemId: string) {
  return requestJson<{ id: string; removedFromLibrary: boolean; deletedFile: boolean; alreadyMissing?: boolean }>(`/api/library/${mediaItemId}`, {
    method: "DELETE",
  });
}

export async function deleteLibraryFile(mediaItemId: string) {
  return requestJson<{
    id: string;
    path?: string;
    removedFromLibrary: boolean;
    deletedFile: boolean;
    alreadyMissing?: boolean;
    fileWasMissing?: boolean;
  }>(
    `/api/library/${mediaItemId}/file`,
    {
      method: "DELETE",
    },
  );
}

export async function revealLibraryItem(mediaItemId: string) {
  return requestJson<{ revealed: boolean }>(`/api/library/${mediaItemId}/reveal`, {
    method: "POST",
  });
}

export async function openLibraryItem(mediaItemId: string) {
  return requestJson<{ opened: boolean; target: string; targetType: "local" | "drive" }>(`/api/library/${mediaItemId}/open`, {
    method: "POST",
  });
}

export async function saveProgress(input: {
  mediaItemId: string;
  currentTime: number;
  duration: number;
  completed?: boolean;
}) {
  return requestJson<{ mediaItemId: string; percentage: number; completed: boolean }>("/api/progress", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function markCompleted(mediaItemId: string) {
  return requestJson<{ mediaItemId: string; completed: boolean }>(`/api/progress/${mediaItemId}/complete`, {
    method: "POST",
  });
}

export async function getDownloads(): Promise<ApiDownloadItem[]> {
  return requestJson<ApiDownloadItem[]>("/api/downloads");
}

export async function createDownload(input: {
  mediaItemId: string;
  destinationStorageType: "notebook" | "pendrive";
}) {
  return requestJson<ApiDownloadItem>("/api/downloads", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function cancelDownload(downloadId: string) {
  return requestJson<ApiDownloadItem>(`/api/downloads/${downloadId}/cancel`, {
    method: "POST",
  });
}

export async function copyToPendrive(mediaItemId: string) {
  return requestJson<ApiDownloadItem>("/api/pendrive/copy", {
    method: "POST",
    body: JSON.stringify({ mediaItemId }),
  });
}

export async function removePendriveItem(mediaItemId: string) {
  return requestJson<{ id: string; removed: boolean }>(`/api/pendrive/items/${mediaItemId}`, {
    method: "DELETE",
  });
}
