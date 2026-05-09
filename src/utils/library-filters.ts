import type { ApiMediaItem } from "../api/client";
import { isPlayableVideoExtension } from "./content";

export type LibraryTypeFilter = "all" | "course" | "movie" | "series" | "file" | "video" | "pdf" | "zip";
export type LibraryStorageFilter = "all" | "notebook" | "pendrive" | "google_drive" | "offline" | "unavailable" | "pendrive_disconnected";
export type LibraryStatusFilter = "all" | "available" | "offline_ready" | "pendrive_disconnected" | "missing" | "downloading";
export type LibrarySpecialFilter = "all" | "missing_cover" | "missing_genre" | "missing_collection";

export interface LibraryFilterState {
  type: LibraryTypeFilter;
  storage: LibraryStorageFilter;
  status: LibraryStatusFilter;
  special: LibrarySpecialFilter;
}

export const DEFAULT_LIBRARY_FILTERS: LibraryFilterState = {
  type: "all",
  storage: "all",
  status: "all",
  special: "all",
};

export function matchesLibraryFilters(item: ApiMediaItem, filters: LibraryFilterState, search = ""): boolean {
  const term = search.trim().toLowerCase();
  const searchable = [item.title, item.fileName, item.genre, item.collection, item.category, item.extension, item.sourceName, item.releaseDate, item.year]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const matchesSearch = !term || searchable.includes(term);

  const matchesType =
    filters.type === "all" ||
    (filters.type === "course" && item.contentType === "course") ||
    (filters.type === "movie" && item.contentType === "movie") ||
    (filters.type === "series" && Boolean(item.collection)) ||
    (filters.type === "file" && item.contentType === "file") ||
    (filters.type === "video" && isPlayableVideoExtension(item.extension)) ||
    (filters.type === "pdf" && item.extension.toLowerCase() === ".pdf") ||
    (filters.type === "zip" && item.extension.toLowerCase() === ".zip");

  const storageLocation = item.localStorageType ?? item.storageType;
  const matchesStorage =
    filters.storage === "all" ||
    (filters.storage === "notebook" && storageLocation === "notebook") ||
    (filters.storage === "pendrive" && storageLocation === "pendrive") ||
    (filters.storage === "google_drive" && item.storageType === "google_drive") ||
    (filters.storage === "offline" && item.isOffline) ||
    (filters.storage === "unavailable" && ["missing", "pendrive_disconnected"].includes(item.status)) ||
    (filters.storage === "pendrive_disconnected" && item.status === "pendrive_disconnected");

  const matchesStatus =
    filters.status === "all" ||
    (filters.status === "available" && !["missing", "pendrive_disconnected", "error"].includes(item.status)) ||
    item.status === filters.status;

  const matchesSpecial =
    filters.special === "all" ||
    (filters.special === "missing_cover" && !item.hasCover) ||
    (filters.special === "missing_genre" && !item.genre) ||
    (filters.special === "missing_collection" && !item.collection);

  return matchesSearch && matchesType && matchesStorage && matchesStatus && matchesSpecial;
}

export function clearFiltersWithType(type: LibraryTypeFilter = "all"): LibraryFilterState {
  return {
    ...DEFAULT_LIBRARY_FILTERS,
    type,
  };
}
