import { Filter, RotateCcw } from "lucide-react";
import type {
  LibraryFilterState,
  LibrarySpecialFilter,
  LibraryStatusFilter,
  LibraryStorageFilter,
  LibraryTypeFilter,
} from "../utils/library-filters";

interface FilterOption<T extends string> {
  value: T;
  label: string;
}

interface LibraryFiltersProps {
  filters: LibraryFilterState;
  onChange: (filters: LibraryFilterState) => void;
  onClear: () => void;
  resultCount?: number;
  typeOptions?: Array<FilterOption<LibraryTypeFilter>>;
  showSpecial?: boolean;
}

const DEFAULT_TYPE_OPTIONS: Array<FilterOption<LibraryTypeFilter>> = [
  { value: "all", label: "Todos" },
  { value: "course", label: "Cursos" },
  { value: "movie", label: "Filmes" },
  { value: "series", label: "Séries/Coleções" },
  { value: "file", label: "Arquivos" },
  { value: "video", label: "Vídeos" },
  { value: "pdf", label: "PDFs" },
  { value: "zip", label: "ZIPs" },
];

const STORAGE_OPTIONS: Array<FilterOption<LibraryStorageFilter>> = [
  { value: "all", label: "Todos" },
  { value: "notebook", label: "Notebook" },
  { value: "pendrive", label: "Pendrive" },
  { value: "google_drive", label: "Google Drive" },
  { value: "offline", label: "Offline" },
  { value: "unavailable", label: "Indisponível" },
  { value: "pendrive_disconnected", label: "Pendrive desconectado" },
];

const STATUS_OPTIONS: Array<FilterOption<LibraryStatusFilter>> = [
  { value: "all", label: "Todos" },
  { value: "available", label: "Disponível" },
  { value: "offline_ready", label: "Offline pronto" },
  { value: "pendrive_disconnected", label: "Pendrive desconectado" },
  { value: "missing", label: "Ausente/Missing" },
  { value: "downloading", label: "Baixando" },
];

const SPECIAL_OPTIONS: Array<FilterOption<LibrarySpecialFilter>> = [
  { value: "all", label: "Sem filtro extra" },
  { value: "missing_cover", label: "Sem capa" },
  { value: "missing_genre", label: "Sem gênero" },
  { value: "missing_collection", label: "Sem coleção" },
];

export function LibraryFilters({
  filters,
  onChange,
  onClear,
  resultCount,
  typeOptions = DEFAULT_TYPE_OPTIONS,
  showSpecial = true,
}: LibraryFiltersProps) {
  return (
    <section className="panel p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
        <div className="grid flex-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-semibold text-[var(--muted)]">
            Tipo
            <select
              value={filters.type}
              onChange={(event) => onChange({ ...filters, type: event.target.value as LibraryTypeFilter })}
              className="select-field mt-1"
            >
              {typeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-semibold text-[var(--muted)]">
            Local
            <select
              value={filters.storage}
              onChange={(event) => onChange({ ...filters, storage: event.target.value as LibraryStorageFilter })}
              className="select-field mt-1"
            >
              {STORAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-semibold text-[var(--muted)]">
            Status
            <select
              value={filters.status}
              onChange={(event) => onChange({ ...filters, status: event.target.value as LibraryStatusFilter })}
              className="select-field mt-1"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {showSpecial ? (
            <label className="text-sm font-semibold text-[var(--muted)]">
              Organização
              <select
                value={filters.special}
                onChange={(event) => onChange({ ...filters, special: event.target.value as LibrarySpecialFilter })}
                className="select-field mt-1"
              >
                {SPECIAL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          {typeof resultCount === "number" ? (
            <span className="status-pill inline-flex items-center gap-1">
              <Filter className="h-3.5 w-3.5" />
              {resultCount} resultado(s)
            </span>
          ) : null}
          <button type="button" onClick={onClear} className="btn-secondary inline-flex items-center gap-2 px-3 py-2 text-xs">
            <RotateCcw className="h-4 w-4" />
            Limpar filtros
          </button>
        </div>
      </div>
    </section>
  );
}
