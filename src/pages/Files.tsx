import { useEffect, useMemo, useState } from "react";
import { FileArchive, FileText, FileType2, Film, Folder, FolderOpen, Info, PlayCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { getLibrary, revealLibraryItem, type ApiMediaItem } from "../api/client";
import { Header } from "../components/Header";
import { LibraryFilters } from "../components/LibraryFilters";
import { ProgressBar } from "../components/ProgressBar";
import { canOpenPlayerForMedia, formatBytes, getStatusLabel, getStorageLabel, getTypeLabel } from "../utils/content";
import { DEFAULT_LIBRARY_FILTERS, matchesLibraryFilters, type LibraryFilterState } from "../utils/library-filters";

function resolveExtensionLabel(fileName: string): string {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "outros";
}

function resolveExtensionIcon(extension: string) {
  switch (extension) {
    case "pdf":
      return FileText;
    case "zip":
    case "rar":
      return FileArchive;
    case "mp4":
    case "mkv":
    case "avi":
    case "mov":
    case "webm":
    case "m4v":
      return Film;
    default:
      return FileType2;
  }
}

export function Files() {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<LibraryFilterState>(DEFAULT_LIBRARY_FILTERS);
  const [items, setItems] = useState<ApiMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [revealingId, setRevealingId] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadBackendLibrary() {
      setLoading(true);
      setError("");

      try {
        const data = await getLibrary();
        if (!isMounted) {
          return;
        }

        setItems(data);
      } catch (cause) {
        if (isMounted) {
          setError(cause instanceof Error ? cause.message : "Falha ao carregar biblioteca local.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadBackendLibrary();

    return () => {
      isMounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    return items.filter((item) => matchesLibraryFilters(item, filters, search));
  }, [items, search, filters]);

  async function handleRevealFolder(mediaItemId: string) {
    setRevealingId(mediaItemId);
    setFeedback("");

    try {
      await revealLibraryItem(mediaItemId);
      setFeedback("Pasta aberta no sistema.");
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Abrir pasta local ficará melhor no app desktop.");
    } finally {
      setRevealingId("");
    }
  }

  return (
    <>
      <Header
        title="Arquivos"
        subtitle="PDFs, pacotes e materiais gerais sem depender do Explorador"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar arquivo"
      />

      <div className="page-body space-y-4">
        <LibraryFilters
          filters={filters}
          onChange={setFilters}
          onClear={() => setFilters(DEFAULT_LIBRARY_FILTERS)}
          resultCount={filtered.length}
          typeOptions={[
            { value: "all", label: "Todos" },
            { value: "file", label: "Arquivos" },
            { value: "video", label: "Vídeos" },
            { value: "pdf", label: "PDFs" },
            { value: "zip", label: "ZIPs" },
            { value: "course", label: "Cursos" },
            { value: "movie", label: "Filmes" },
            { value: "series", label: "Séries/Coleções" },
          ]}
        />

        <section className="panel p-4">
          <p className="text-xs text-[var(--muted)]">{filtered.length} item(ns) encontrados por metadata, sem carregar arquivos pesados.</p>
          {feedback ? <p className="mt-3 text-sm text-[var(--muted)]">{feedback}</p> : null}
        </section>

        {loading ? <p className="panel p-4 text-sm text-[var(--muted)]">Carregando arquivos...</p> : null}
        {error ? <p className="panel p-4 text-sm text-rose-300">{error}</p> : null}

        <section>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((file) => {
              const extension = resolveExtensionLabel(file.fileName);
              const Icon = resolveExtensionIcon(extension);
              const canPlay = canOpenPlayerForMedia(file);
              const canReveal = file.status !== "missing" && file.status !== "pendrive_disconnected" && (file.storageType !== "google_drive" || Boolean(file.localFilePath));

              return (
                <article key={file.id} className="panel panel-hover fancy-enter p-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-[var(--surface-strong)] p-3 text-slate-200">
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--text)]" title={file.title}>
                        {file.title}
                      </p>
                      <p className="mt-1 truncate text-xs text-[var(--muted)]" title={file.fileName}>
                        Arquivo: {file.fileName}
                      </p>
                      <p className="mt-1 truncate text-xs text-[var(--muted)]" title={file.filePath}>
                        Caminho: {file.filePath}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {getTypeLabel(file.contentType)} - {extension.toUpperCase()} - {formatBytes(file.sizeBytes)}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {getStorageLabel(file.storageType)} - {getStatusLabel(file.status as Parameters<typeof getStatusLabel>[0])}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3">
                    <ProgressBar value={file.progress.percentage} compact />
                  </div>

                  <div className={`mt-4 grid gap-2 ${canPlay ? "grid-cols-3" : "grid-cols-2"}`}>
                    {canPlay ? (
                      <Link to={`/player/local/${file.id}`} className="btn-primary inline-flex items-center justify-center gap-1 px-3 py-2 text-center text-xs">
                        <PlayCircle className="h-4 w-4" />
                        Player
                      </Link>
                    ) : null}
                    <Link to={`/content/${file.id}`} className="btn-secondary inline-flex items-center justify-center gap-1 px-3 py-2 text-center text-xs">
                      <Info className="h-4 w-4" />
                      Detalhes
                    </Link>
                    <button
                      type="button"
                      onClick={() => void handleRevealFolder(file.id)}
                      disabled={!canReveal || revealingId === file.id}
                      className="btn-secondary inline-flex items-center justify-center gap-1 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <FolderOpen className="h-4 w-4" />
                      Pasta
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {!loading && !error && !filtered.length ? (
            <p className="panel p-4 text-sm text-[var(--muted)]">Nenhum item encontrado para os filtros atuais.</p>
          ) : null}
        </section>

        <section className="panel p-4">
          <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <Folder className="h-4 w-4" />
            Escaneie os caminhos de Arquivos na tela de Armazenamento ou Configurações para atualizar esta lista.
          </div>
        </section>
      </div>
    </>
  );
}
