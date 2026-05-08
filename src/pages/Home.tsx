import { ArrowRight, CloudDownload, HardDrive, PlayCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getDownloads, getLibrary, getStorageSources, type ApiDownloadItem, type ApiMediaItem, type ApiStorageSource } from "../api/client";
import { Header } from "../components/Header";
import type { DownloadItem } from "../types/content";
import { formatPercentage, getDownloadStatusLabel, getStorageLabel, getStorageStatusLabel, getTypeLabel, isPlayableVideoExtension } from "../utils/content";

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

export function Home() {
  const [search, setSearch] = useState("");
  const [libraryItems, setLibraryItems] = useState<ApiMediaItem[]>([]);
  const [storageSources, setStorageSources] = useState<ApiStorageSource[]>([]);
  const [downloads, setDownloads] = useState<ApiDownloadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      setLoading(true);
      setError("");

      try {
        const [library, storage, downloadQueue] = await Promise.all([getLibrary(), getStorageSources(), getDownloads()]);

        if (!isMounted) {
          return;
        }

        setLibraryItems(library);
        setStorageSources(storage);
        setDownloads(downloadQueue);
      } catch (cause) {
        if (isMounted) {
          setError(cause instanceof Error ? cause.message : "Falha ao carregar dashboard.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return libraryItems;
    }

    return libraryItems.filter((item) => item.title.toLowerCase().includes(term) || item.fileName.toLowerCase().includes(term));
  }, [search, libraryItems]);

  const offlineCount = libraryItems.filter((item) => item.isOffline).length;
  const downloadsInProgress = downloads.filter((item) => item.status === "downloading" || item.status === "paused" || item.status === "queued");

  const continueWatching = [...libraryItems]
    .filter((item) => isPlayableVideoExtension(item.extension) && item.progress.percentage > 0 && item.progress.percentage < 100)
    .sort((a, b) => b.progress.percentage - a.progress.percentage)
    .slice(0, 4);

  const latestAdded = [...libraryItems]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

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
    {
      label: "Biblioteca",
      value: libraryItems.length,
      note: "itens catalogados",
    },
    {
      label: "Offline",
      value: offlineCount,
      note: "prontos sem internet",
    },
    {
      label: "Downloads",
      value: downloadsInProgress.length,
      note: "em andamento",
    },
    {
      label: "Armazenamentos",
      value: storageSources.length,
      note: "fontes monitoradas",
    },
  ];

  const displayedLibrary = search.trim() ? filtered.slice(0, 6) : libraryItems.slice(0, 6);

  return (
    <>
      <Header
        title="Dashboard"
        subtitle="Visão central da sua biblioteca com foco no que importa"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar conteúdo na home"
        variant="dark"
      />

      <div className="page-body home-dark-page home-dark-surface space-y-6">
        {loading ? <p className="home-block p-4 text-sm text-slate-300">Carregando dashboard...</p> : null}
        {error ? <p className="home-block p-4 text-sm text-rose-300">{error}</p> : null}

        <section className="home-block home-hero fancy-enter p-6 lg:p-8">
          <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
            <div>
              <p className="home-kicker">MediaVault Overview</p>
              <h2 className="brand-font mt-2 max-w-2xl text-3xl font-semibold leading-tight text-slate-100 lg:text-4xl">
                Sua biblioteca pessoal, organizada com visual limpo e foco no consumo.
              </h2>
              <p className="mt-3 max-w-2xl text-sm text-slate-300 lg:text-base">
                Continue rapidamente de onde parou, acompanhe downloads e veja o estado dos armazenamentos sem ruído visual.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {summaryCards.map((item) => (
                  <article key={item.label} className="home-stat-card p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">{item.label}</p>
                    <p className="brand-font mt-2 text-3xl font-semibold text-slate-100">{item.value}</p>
                    <p className="mt-1 text-xs text-slate-400">{item.note}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="home-stat-card p-5">
              <div className="flex items-center gap-2 text-slate-200">
                <HardDrive className="h-4 w-4" />
                <p className="text-xs font-semibold uppercase tracking-[0.16em]">Armazenamento</p>
              </div>

              <div className="mt-4 space-y-4">
                {storageOverview.map((source) => (
                  <article key={source.id} className="home-row p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-100">{getStorageLabel(source.type)}</p>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                        {getStorageStatusLabel(source.status)}
                      </span>
                    </div>
                    <div className="mt-2 home-progress-track">
                      <div className="home-progress-fill" style={{ width: `${source.usage}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      {source.usedSpaceGb}GB / {source.totalSpaceGb}GB · {formatPercentage(source.usage)}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="brand-font text-xl font-semibold text-slate-100">Continuar assistindo</h3>
            <Link to="/courses" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-300 hover:text-slate-100">
              Ver tudo <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {continueWatching.map((content) => (
              <article key={content.id} className="home-media-card fancy-enter">
                <img src={content.thumbnail} alt={content.title} className="h-full w-full object-cover" />
                <div className="home-media-overlay">
                  <span className="home-tag">{content.category}</span>
                  <h4 className="mt-2 text-base font-semibold text-slate-100">{content.title}</h4>
                  <p className="mt-1 text-xs text-slate-300">{getTypeLabel(content.contentType)}</p>
                  <div className="mt-3 home-progress-track">
                    <div className="home-progress-fill" style={{ width: `${content.progress.percentage}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-slate-300">{Math.round(content.progress.percentage)}% concluído</p>

                  <div className="mt-3 flex items-center gap-2">
                    {isPlayableVideoExtension(content.extension) ? (
                      <Link to={`/player/local/${content.id}`} className="home-action inline-flex items-center gap-1 px-3 py-1.5 text-xs">
                        <PlayCircle className="h-3.5 w-3.5" /> Assistir
                      </Link>
                    ) : null}
                    <Link to={`/content/${content.id}`} className="text-xs font-semibold text-slate-200 hover:text-white">
                      Detalhes
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
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
                      <p className="text-sm font-semibold text-slate-100">{download.title}</p>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                        {getDownloadStatusLabel(download.status as DownloadItem["status"])}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{download.size}</p>
                    <div className="mt-2 home-progress-track">
                      <div className="home-progress-fill" style={{ width: `${download.progress}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{Math.round(download.progress)}%</p>
                  </article>
                ))
              ) : (
                <p className="home-row p-4 text-sm text-slate-300">Nenhum download em andamento no momento.</p>
              )}
            </div>
          </div>

          <div className="home-block p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="brand-font text-lg font-semibold text-slate-100">Últimos adicionados</h3>
              <span className="text-xs text-slate-400">{latestAdded.length} itens</span>
            </div>

            <div className="space-y-2">
              {latestAdded.map((item) => (
                <article key={item.id} className="home-row flex items-center gap-3 p-3">
                  <img src={item.thumbnail} alt={item.title} className="h-12 w-16 rounded-md object-cover" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-100">{item.title}</p>
                    <p className="text-xs text-slate-400">{getTypeLabel(item.contentType)} · {item.category}</p>
                  </div>
                  <span className="ml-auto text-xs text-slate-400">{new Date(item.createdAt).toLocaleDateString("pt-BR")}</span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="home-block p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="brand-font text-lg font-semibold text-slate-100">
              {search.trim() ? "Resultados da busca" : "Explorar biblioteca"}
            </h3>
            <span className="text-xs text-slate-400">{filtered.length} resultado(s)</span>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {displayedLibrary.map((item) => (
              <article key={item.id} className="home-row p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-400">{getTypeLabel(item.contentType)}</p>
                <h4 className="mt-1 text-sm font-semibold text-slate-100">{item.title}</h4>
                <p className="mt-1 text-xs text-slate-400">{item.category}</p>
                <div className="mt-3 flex items-center gap-2">
                  <Link to={`/content/${item.id}`} className="home-action px-3 py-1.5 text-xs">
                    Abrir
                  </Link>
                  {isPlayableVideoExtension(item.extension) ? (
                    <Link to={`/player/local/${item.id}`} className="text-xs font-semibold text-slate-300 hover:text-white">
                      Assistir
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
