import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getLibrary, removePendriveItem, type ApiMediaItem } from "../api/client";
import { Header } from "../components/Header";
import { LibraryFilters } from "../components/LibraryFilters";
import { canOpenPlayerForMedia, getStatusLabel, getStorageLabel, getTypeLabel } from "../utils/content";
import { DEFAULT_LIBRARY_FILTERS, matchesLibraryFilters, type LibraryFilterState } from "../utils/library-filters";

export function Offline() {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<LibraryFilterState>({ ...DEFAULT_LIBRARY_FILTERS, storage: "offline" });
  const [items, setItems] = useState<ApiMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");

    try {
      const data = await getLibrary({ offline: true });
      setItems(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar conteúdos offline.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const offlineItems = useMemo(
    () => items.filter((item) => matchesLibraryFilters(item, filters, search)),
    [items, filters, search],
  );

  const byNotebook = offlineItems.filter((item) => (item.localStorageType ?? item.storageType) === "notebook");
  const byPendrive = offlineItems.filter((item) => (item.localStorageType ?? item.storageType) === "pendrive");

  async function handleRemovePendriveItem(mediaItemId: string) {
    setBusyId(mediaItemId);
    setError("");

    try {
      await removePendriveItem(mediaItemId);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao remover item do pendrive.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <>
      <Header
        title="Offline"
        subtitle="Conteúdos disponíveis sem internet"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar offline"
      />

      <div className="page-body space-y-5">
        <LibraryFilters
          filters={filters}
          onChange={setFilters}
          onClear={() => setFilters({ ...DEFAULT_LIBRARY_FILTERS, storage: "offline" })}
          resultCount={offlineItems.length}
        />

        <section className="panel grid gap-2 p-4 text-xs text-[var(--muted)] md:grid-cols-3">
          <p>Notebook: {byNotebook.length} item(ns)</p>
          <p>Pendrive: {byPendrive.length} item(ns)</p>
          <p>Total filtrado: {offlineItems.length} item(ns)</p>
        </section>

        {loading ? <p className="panel p-4 text-sm text-[var(--muted)]">Carregando biblioteca offline...</p> : null}
        {error ? <p className="panel p-4 text-sm text-rose-300">{error}</p> : null}

        <section className="grid gap-5 xl:grid-cols-2">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="brand-font text-xl font-semibold text-[var(--text)]">Offline no notebook</h2>
              <p className="text-xs text-[var(--muted)]">{byNotebook.length} item(ns)</p>
            </div>
            <div className="space-y-3">
              {byNotebook.map((item) => (
                <article key={item.id} className="panel fancy-enter p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[var(--text)]">{item.title}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {getTypeLabel(item.contentType)} - {getStorageLabel(item.localStorageType ?? item.storageType)}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">Arquivo: {item.fileName}</p>
                      <p className="mt-1 break-all text-xs text-[var(--muted)]">Caminho: {item.localFilePath || item.filePath}</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">Status: {getStatusLabel(item.status as Parameters<typeof getStatusLabel>[0])}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {canOpenPlayerForMedia(item) ? (
                        <Link to={`/player/local/${item.id}`} className="btn-primary px-3 py-1.5 text-xs">
                          Assistir
                        </Link>
                      ) : null}
                      <Link to={`/content/${item.id}`} className="btn-secondary px-3 py-1.5 text-xs">
                        Abrir
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
              {!loading && !byNotebook.length ? <p className="panel p-4 text-sm text-[var(--muted)]">Nenhum item no notebook.</p> : null}
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="brand-font text-xl font-semibold text-[var(--text)]">Offline no pendrive</h2>
              <p className="text-xs text-[var(--muted)]">{byPendrive.length} item(ns)</p>
            </div>
            <div className="space-y-3">
              {byPendrive.map((item) => (
                <article key={item.id} className="panel fancy-enter p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[var(--text)]">{item.title}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {getTypeLabel(item.contentType)} - {getStorageLabel(item.localStorageType ?? item.storageType)}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">Arquivo: {item.fileName}</p>
                      <p className="mt-1 break-all text-xs text-[var(--muted)]">Caminho: {item.localFilePath || item.filePath}</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">Status: {getStatusLabel(item.status as Parameters<typeof getStatusLabel>[0])}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {canOpenPlayerForMedia(item) ? (
                        <Link to={`/player/local/${item.id}`} className="btn-primary px-3 py-1.5 text-xs">
                          Assistir
                        </Link>
                      ) : null}
                      <Link to={`/content/${item.id}`} className="btn-secondary px-3 py-1.5 text-xs">
                        Abrir
                      </Link>
                      {(item.localStorageType ?? item.storageType) === "pendrive" && item.storageType === "pendrive" ? (
                        <button
                          type="button"
                          onClick={() => void handleRemovePendriveItem(item.id)}
                          disabled={busyId === item.id}
                          className="btn-danger-soft px-3 py-1.5 text-xs disabled:opacity-50"
                        >
                          Remover offline
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
              {!loading && !byPendrive.length ? <p className="panel p-4 text-sm text-[var(--muted)]">Nenhum item no pendrive.</p> : null}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
