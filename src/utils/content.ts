import type { ContentType, DownloadItem, MediaStatus, StorageSource, StorageType } from "../types/content";

export function getStorageLabel(storage: StorageType): string {
  switch (storage) {
    case "google_drive":
      return "Google Drive";
    case "notebook":
      return "Notebook";
    case "pendrive":
      return "Pendrive";
    default:
      return storage;
  }
}

export function getStorageIcon(storage: StorageType): string {
  switch (storage) {
    case "google_drive":
      return "☁";
    case "notebook":
      return "💻";
    case "pendrive":
      return "🔌";
    default:
      return "📦";
  }
}

export function getTypeLabel(type: ContentType): string {
  switch (type) {
    case "course":
      return "Curso";
    case "movie":
      return "Filme";
    case "file":
      return "Arquivo";
    default:
      return type;
  }
}

export function getStatusLabel(status: MediaStatus): string {
  switch (status) {
    case "available_local":
      return "Disponível local";
    case "available_pendrive":
      return "Disponível no pendrive";
    case "available_drive":
      return "Disponível no Drive";
    case "downloading":
      return "Baixando";
    case "offline_ready":
      return "Offline pronto";
    case "missing":
      return "Indisponível";
    case "pendrive_disconnected":
      return "Pendrive desconectado";
    case "error":
      return "Erro";
    default:
      return status;
  }
}

export function getStorageStatusLabel(status: StorageSource["status"]): string {
  switch (status) {
    case "active":
      return "Ativo";
    case "connected":
      return "Conectado";
    case "disconnected":
      return "Desconectado";
    case "syncing":
      return "Sincronizando";
    default:
      return status;
  }
}

export function getDownloadStatusLabel(status: DownloadItem["status"]): string {
  switch (status) {
    case "queued":
      return "Na fila";
    case "downloading":
      return "Baixando";
    case "paused":
      return "Pausado";
    case "completed":
      return "Concluído";
    case "failed":
      return "Falhou";
    case "cancelled":
      return "Cancelado";
    default:
      return status;
  }
}

export function formatPercentage(value: number): string {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

export function sortByProgressDesc<T extends { progress: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.progress - a.progress);
}

export function sortByDurationAsc<T extends { duration?: string }>(items: T[]): T[] {
  const toMinutes = (duration?: string): number => {
    if (!duration) return Number.MAX_SAFE_INTEGER;

    const normalized = duration.replace(/\s+/g, "").toLowerCase();
    const compactHourMinuteMatch = normalized.match(/(\d+)h(\d+)/);
    const hourMatch = normalized.match(/(\d+)h/);
    const minuteMatch = normalized.match(/(\d+)(min|m)/);

    const hours = compactHourMinuteMatch
      ? Number(compactHourMinuteMatch[1])
      : hourMatch
        ? Number(hourMatch[1])
        : 0;
    const minutes = compactHourMinuteMatch
      ? Number(compactHourMinuteMatch[2])
      : minuteMatch
        ? Number(minuteMatch[1])
        : 0;

    return hours * 60 + minutes;
  };

  return [...items].sort((a, b) => toMinutes(a.duration) - toMinutes(b.duration));
}

export function getUsedSpacePercentage(source: StorageSource): number {
  if (source.totalSpaceGb === 0) {
    return 0;
  }

  return (source.usedSpaceGb / source.totalSpaceGb) * 100;
}

export function isPlayableVideoExtension(extension: string | undefined): boolean {
  if (!extension) {
    return false;
  }

  return [
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
  ].includes(extension.toLowerCase());
}

export function canOpenPlayerForMedia(input: {
  extension?: string;
  storageType?: StorageType;
  storage?: StorageType;
  localFilePath?: string | null;
  driveFileId?: string | null;
}): boolean {
  const storageType = input.storageType ?? input.storage;
  return (
    isPlayableVideoExtension(input.extension) &&
    (storageType !== "google_drive" || Boolean(input.localFilePath) || Boolean(input.driveFileId))
  );
}

export function isOnlinePlayerMedia(input: {
  extension?: string;
  storageType?: StorageType;
  storage?: StorageType;
  localFilePath?: string | null;
  driveFileId?: string | null;
}): boolean {
  const storageType = input.storageType ?? input.storage;
  return isPlayableVideoExtension(input.extension) && storageType === "google_drive" && !input.localFilePath && Boolean(input.driveFileId);
}

export function formatBytes(bytesValue: number | undefined): string {
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

export function formatDateOnly(isoDate: string | null | undefined): string {
  if (!isoDate) {
    return "--";
  }

  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return "--";
  }

  return parsed.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
