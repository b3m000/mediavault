const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787";

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: { message?: string };
}

async function requestJson<T>(endpoint: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const payload = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !payload.success) {
    throw new Error(payload.error?.message ?? `Falha na requisição ${endpoint}`);
  }

  return payload.data;
}

export interface ApiStorageSource {
  id: number;
  name: string;
  type: "notebook" | "pendrive" | "google_drive";
  path: string;
  status: "active" | "connected" | "disconnected" | "syncing";
  last_scan_at?: string | null;
  usedBytes?: number;
}

export interface ApiMediaItem {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  contentType: "course" | "movie" | "file";
  category: string;
  durationLabel: string;
  fileName: string;
  filePath: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  storageType: "notebook" | "pendrive" | "google_drive";
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
  mimeType: string;
  sizeBytes: number;
  streamUrl: string;
  subtitleTracks: ApiSubtitleTrack[];
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

export async function scanStorage(type: "all" | "notebook" | "pendrive" = "all") {
  return requestJson<Array<Record<string, unknown>>>("/api/storage/scan", {
    method: "POST",
    body: JSON.stringify({ type }),
  });
}

export async function getLibrary(params?: { type?: string; offline?: boolean; search?: string }): Promise<ApiMediaItem[]> {
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

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestJson<ApiMediaItem[]>(`/api/library${suffix}`);
}

export async function getPlayerItem(mediaItemId: string): Promise<ApiPlayerItem> {
  return requestJson<ApiPlayerItem>(`/api/player/${mediaItemId}`);
}

export async function getLibraryItem(mediaItemId: string): Promise<ApiMediaItem> {
  return requestJson<ApiMediaItem>(`/api/library/${mediaItemId}`);
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
