import { ArrowRight, CloudDownload, HardDrive, PlayCircle, Radar, Search, Server } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getDownloads,
  getLibrary,
  getStorageSources,
  scanStorage,
  type ApiDownloadItem,
  type ApiMediaItem,
  type ApiStorageSource,
} from "../api/client";
import { Header } from "../components/Header";
import { LibraryFilters } from "../components/LibraryFilters";
import { MediaCarousel } from "../components/MediaCarousel";
import {
  formatPercentage,
  canOpenPlayerForMedia,
  getDownloadStatusLabel,
  getStorageLabel,
  getStorageStatusLabel,
  getTypeLabel,
} from "../utils/content";
import {
  DEFAULT_LIBRARY_FILTERS,
  clearFiltersWithType,
  matchesLibraryFilters,
  type LibraryFilterState,
} from "../utils/library-filters";

function toGb(bytes = 0): number {
  return Number((bytes / 1024 / 1024 / 1024).toFixed(2));
}

function resolveTotalSpace(type: ApiStorageSource["type"]): number {
  switch (type) {
    case "notebook":
      return 512;
    case "pendrive":
      return 256;
    case "google_drive":
      return 2000;
    default:
      return 0;
  }
}

function uniqueCollections(items: ApiMediaItem[]): ApiMediaItem[] {
  const byCollection = new Map<string, ApiMediaItem>();

  for (const item of items) {
    if (!item.collection) {
      continue;
    }

    const current = byCollection.get(item.collection);
    if (!current || item.collectionOrder === 1 || item.updatedAt > current.updatedAt) {
      byCollection.set(item.collection, item);
    }
  }

  return Array.from(byCollection.values()).sort((a, b) => a.collection.localeCompare(b.collection));
}

export function Home() {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<LibraryFilterState>(DEFAULT_LIBRARY_FILTERS);
  const [libraryItems, setLibraryItems] = useState<ApiMediaItem[]>([]);
  const [storageSources, setStorageSources] = useState<ApiStorageSource[]>([]);
  const [downloads, setDownloads] = useState<ApiDownloadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  async function loadDashboard() {
    setLoading(true);
    setError("");

    try {
      const [library, storage, downloadQueue] = await Promise.all([getLibrary(), getStorageSources(), getDownloads()]);
      setLibraryItems(library);
      setStorageSources(storage);
      setDownloads(downloadQueue);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  async function handleScanAll() {
    setBusy(true);
    setFeedback("");

    try {
      await scanStorage("all");
      await loadDashboard();
      setFeedback("Escaneamento local concluído.");
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Falha ao escanear armazenamentos.");
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(
    () => libraryItems.filter((item) => matchesLibraryFilters(item, filters, search)),
    [libraryItems, filters, search],
  );

  const movies = useMemo(() => filtered.filter((item) => item.contentType === "movie"), [filtered]);
  const courses = useMemo(() => filtered.filter((item) => item.contentType === "course"), [filtered]);
  const collections = useMemo(() => uniqueCollections(filtered), [filtered]);
  const continueWatching = useMemo(
    () =>
      filtered
        .filter(
          (item) =>
            canOpenPlayerForMedia(item) &&
            item.progress.percentage > 0 &&
            item.progress.percentage < 100,
        )
        .sort((a, b) => b.progress.percentage - a.progress.percentage)
        .slice(0, 12),
    [filtered],
  );
  const latestAdded = useMemo(
    () => [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 12),
    [filtered],
  );

  const offlineCount = libraryItems.filter((item) => item.isOffline).length;
  const downloadsInProgress = downloads.filter((item) => ["downloading", "paused", "queued"].includes(item.status));
  const storageOverview = storageSources.map((source) => {
    const totalSpaceGb = resolveTotalSpace(source.type);
    const usedSpaceGb = toGb(source.usedBytes ?? 0);
    const usage = totalSpaceGb > 0 ? (usedSpaceGb / totalSpaceGb) * 100 : 0;

    return {
      ...source,
      totalSpaceGb,
      usedSpaceGb,
      usage,
    };
  });

  const summaryCards = [
    { label: "Biblioteca", value: libraryItems.length, note: "itens catalogados" },
    { label: "Filmes", value: libraryItems.filter((item) => item.contentType === "movie").length, note: "títulos na coleção" },
    { label: "Cursos", value: libraryItems.filter((item) => item.contentType === "course").length, note: "materiais de estudo" },
    { label: "Offline", value: offlineCount, note: "prontos no dispositivo" },
  ];

  return (
    <>
      <Header
        title="Central de mídia"
        subtitle="Filmes, cursos, coleções, arquivos e armazenamento em uma visão única"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por título, arquivo, gênero, coleção ou local"
        variant="dark"
      />

      <div className="page-body home-dark-page home-dark-surface space-y-6">
        {loading ? <p className="home-block p-4 text-sm text-slate-300">Carregando dashboard...</p> : null}
        {error ? <p className="home-block p-4 text-sm text-rose-300">{error}</p> : null}
        {feedback ? <p className="home-block p-4 text-sm text-slate-300">{feedback}</p> : null}

        <section className="home-block home-hero fancy-enter overflow-hidden p-6 lg:p-8">
          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div>
              <p className="home-kicker">MediaVault Local</p>
              <h2 className="brand-font mt-2 max-w-3xl text-3xl font-semibold leading-tight text-slate-100 lg:text-5xl">
                Uma biblioteca visual para assistir, organizar e encontrar arquivos sem abrir pasta por pasta.
              </h2>
              <p className="mt-4 max-w-2xl text-sm text-slate-300 lg:text-base">
                Capas, coleções, filtros por armazenamento e ações rápidas deixam notebook e pendrive com cara de central de mídia.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void handleScanAll()}
                  disabled={busy}
                  className="btn-primary inline-flex items-center gap-2 px-4 py-3 text-sm disabled:opacity-50"
                >
                  <Radar className="h-4 w-4" />
                  Escanear armazenamento
                </button>
                <Link to="/storage" className="btn-secondary inline-flex items-center gap-2 px-4 py-3 text-sm">
                  <Server className="h-4 w-4" />
                  Acessar armazenamento
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {summaryCards.map((item) => (
                <article key={item.label} className="home-stat-card p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">{item.label}</p>
                  <p className="brand-font mt-2 text-3xl font-semibold text-slate-100">{item.value}</p>
                  <p className="mt-1 text-xs text-slate-400">{item.note}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <LibraryFilters
          filters={filters}
          onChange={setFilters}
          onClear={() => setFilters(clearFiltersWithType("all"))}
          resultCount={filtered.length}
        />

        <MediaCarousel
          title="Continuar assistindo"
          subtitle="Vídeos com progresso salvo no player local"
          items={continueWatching}
          emptyMessage="Nenhum vídeo em andamento para os filtros atuais."
        />

        <MediaCarousel
          title="Filmes em destaque"
          subtitle="Cards com capa/poster, gênero, coleção e armazenamento"
          items={movies}
          emptyMessage="Nenhum filme encontrado para os filtros atuais."
        />

        <MediaCarousel
          title="Cursos em andamento"
          subtitle="Aulas e materiais de estudo disponíveis no catálogo"
          items={courses}
          emptyMessage="Nenhum curso encontrado para os filtros atuais."
        />

        <MediaCarousel
          title="Séries e coleções"
          subtitle="Coleções, trilogias e grupos de vídeos preparados para virar área própria"
          items={collections}
          emptyMessage="Nenhuma coleção ou série cadastrada ainda."
        />

        <MediaCarousel
          title="Adicionados recentemente"
          subtitle="Últimos itens indexados ou sincronizados no catálogo"
          items={latestAdded}
          emptyMessage="Nenhum item recente encontrado."
        />

        <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="home-block p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="brand-font text-lg font-semibold text-slate-100">Downloads em andamento</h3>
              <div className="inline-flex items-center gap-1 text-xs font-semibold text-slate-300">
                <CloudDownload className="h-3.5 w-3.5" /> {downloadsInProgress.length}
              </div>
            </div>

            <div className="space-y-3">
              {downloadsInProgress.length ? (
                downloadsInProgress.map((download) => (
                  <article key={download.id} className="home-row p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-slate-100">{download.title}</p>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                        {getDownloadStatusLabel(download.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{download.size}</p>
                    <div className="mt-2 home-progress-track">
                      <div className="home-progress-fill" style={{ width: `${download.progress}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{formatPercentage(download.progress)}</p>
                  </article>
                ))
              ) : (
                <p className="home-row p-4 text-sm text-slate-300">Nenhum download em andamento no momento.</p>
              )}
            </div>
          </div>

          <div className="home-block p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="brand-font text-lg font-semibold text-slate-100">Armazenamento</h3>
              <Link to="/storage" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-300 hover:text-slate-100">
                Gerenciar <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {storageOverview.map((source) => (
                <article key={source.id} className="home-row p-3">
                  <div className="flex items-center gap-2 text-slate-100">
                    <HardDrive className="h-4 w-4" />
                    <p className="text-sm font-semibold">{getStorageLabel(source.type)}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{getStorageStatusLabel(source.status)}</p>
                  <div className="mt-3 home-progress-track">
                    <div className="home-progress-fill" style={{ width: `${source.usage}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    {source.usedSpaceGb}GB / {source.totalSpaceGb}GB
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {search.trim() ? (
          <section className="home-block p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="brand-font text-lg font-semibold text-slate-100">Resultados da busca</h3>
              <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                <Search className="h-3.5 w-3.5" />
                {filtered.length}
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filtered.slice(0, 9).map((item) => (
                <article key={item.id} className="home-row flex items-center gap-3 p-3">
                  <img src={item.thumbnail} alt={item.title} className="h-14 w-20 rounded-md object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-100">{item.title}</p>
                    <p className="truncate text-xs text-slate-400">
                      {getTypeLabel(item.contentType)} · {item.genre || item.collection || item.category}
                    </p>
                  </div>
                  {canOpenPlayerForMedia(item) ? (
                    <Link to={`/player/local/${item.id}`} className="btn-primary inline-flex h-9 w-9 items-center justify-center">
                      <PlayCircle className="h-4 w-4" />
                    </Link>
                  ) : (
                    <Link to={`/content/${item.id}`} className="btn-secondary px-3 py-2 text-xs">
                      Abrir
                    </Link>
                  )}
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
