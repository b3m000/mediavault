import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getLibrary, removePendriveItem, type ApiMediaItem } from "../api/client";
import { Header } from "../components/Header";
import { getStorageLabel, getTypeLabel } from "../utils/content";

export function Offline() {
  const [typeFilter, setTypeFilter] = useState("all");
  const [items, setItems] = useState<ApiMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const typeOptions = ["all", "course", "movie", "file"];

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

  const offlineItems = useMemo(() => {
    return items.filter((item) => {
      if (typeFilter === "all") {
        return true;
      }

      return item.contentType === typeFilter;
    });
  }, [items, typeFilter]);

  const byNotebook = offlineItems.filter((item) => item.storageType === "notebook");
  const byPendrive = offlineItems.filter((item) => item.storageType === "pendrive");

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
      <Header title="Offline" subtitle="Conteúdos disponíveis sem internet" searchPlaceholder="Buscar offline" />

      <div className="page-body space-y-5">
        <section className="panel p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <label className="text-sm font-semibold text-[var(--muted)]">
              Filtrar por tipo
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="select-field mt-1">
                {typeOptions.map((item) => (
                  <option key={item} value={item}>
                    {item === "all" ? "Todos" : getTypeLabel(item as "course" | "movie" | "file")}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-2 text-xs text-[var(--muted)] md:ml-auto">
              <p>Notebook: {byNotebook.length} item(ns)</p>
              <p>Pendrive: {byPendrive.length} item(ns)</p>
            </div>
          </div>
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
                        {getTypeLabel(item.contentType)} - {getStorageLabel(item.storageType)}
                      </p>
                    </div>
                    <div className="flex gap-2">
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
                        {getTypeLabel(item.contentType)} - {getStorageLabel(item.storageType)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Link to={`/content/${item.id}`} className="btn-secondary px-3 py-1.5 text-xs">
                        Abrir
                      </Link>
                      <button
                        type="button"
                        onClick={() => void handleRemovePendriveItem(item.id)}
                        disabled={busyId === item.id}
                        className="btn-danger-soft px-3 py-1.5 text-xs disabled:opacity-50"
                      >
                        Remover offline
                      </button>
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
