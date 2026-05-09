import { AlertTriangle, FileText, HardDrive, Info, PlayCircle, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  clearStorageContent,
  deleteLibraryFile,
  getLibrary,
  getStorageSources,
  removeLibraryItem,
  scanStorage,
  setStoragePaths,
  syncDrive,
  type ApiMediaItem,
  type ApiStorageContentPaths,
  type ApiStorageSource,
} from "../api/client";
import { Header } from "../components/Header";
import { LibraryFilters } from "../components/LibraryFilters";
import { ProgressBar } from "../components/ProgressBar";
import { StorageCard } from "../components/StorageCard";
import type { StorageSource } from "../types/content";
import {
  formatBytes,
  canOpenPlayerForMedia,
  getStatusLabel,
  getStorageLabel,
  getStorageStatusLabel,
  getTypeLabel,
  isPlayableVideoExtension,
} from "../utils/content";
import { DEFAULT_LIBRARY_FILTERS, matchesLibraryFilters, type LibraryFilterState } from "../utils/library-filters";

type LocalStorageType = "notebook" | "pendrive";
type ContentPathKey = keyof ApiStorageContentPaths;

const PATH_LABELS: Record<ContentPathKey, string> = {
  course: "Cursos",
  movie: "Filmes",
  file: "Arquivos",
};

function toGb(bytes = 0): number {
  return Number((bytes / 1024 / 1024 / 1024).toFixed(2));
}

function clonePaths(paths?: ApiStorageContentPaths): ApiStorageContentPaths {
  return {
    course: paths?.course ?? "",
    movie: paths?.movie ?? "",
    file: paths?.file ?? "",
  };
}

function mapApiToStorageSource(source: ApiStorageSource): StorageSource {
  const totalSpaceByType: Record<ApiStorageSource["type"], number> = {
    notebook: 512,
    pendrive: 256,
    google_drive: 2000,
  };

  return {
    id: String(source.id),
    name: source.name,
    type: source.type,
    path: source.path,
    status: source.status,
    role: source.role,
    usedSpaceGb: toGb(source.usedBytes ?? 0),
    totalSpaceGb: totalSpaceByType[source.type],
    lastSyncAt: source.last_scan_at ? source.last_scan_at.replace("T", " ").slice(0, 16) : "--",
  };
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function itemBelongsToStorage(item: ApiMediaItem, storageType: StorageSource["type"]): boolean {
  if (storageType === "google_drive") {
    return item.storageType === "google_drive";
  }

  return item.storageType === storageType || item.localStorageType === storageType;
}

export function Storage() {
  const [sources, setSources] = useState<StorageSource[]>([]);
  const [paths, setPaths] = useState<Record<LocalStorageType, ApiStorageContentPaths>>({
    notebook: clonePaths(),
    pendrive: clonePaths(),
  });
  const [libraryItems, setLibraryItems] = useState<ApiMediaItem[]>([]);
  const [selectedStorageType, setSelectedStorageType] = useState<StorageSource["type"] | "">("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<LibraryFilterState>(DEFAULT_LIBRARY_FILTERS);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [feedback, setFeedback] = useState<string>("");

  const refreshSources = useCallback(async () => {
    try {
      const [apiSources, library] = await Promise.all([getStorageSources(), getLibrary()]);
      const mapped = apiSources.map(mapApiToStorageSource);
      setSources(mapped);
      setLibraryItems(library);

      const notebook = apiSources.find((item) => item.type === "notebook");
      const pendrive = apiSources.find((item) => item.type === "pendrive");

      setPaths({
        notebook: clonePaths(notebook?.contentPaths),
        pendrive: clonePaths(pendrive?.contentPaths),
      });
    } catch {
      setFeedback("Backend indisponível. Não foi possível carregar armazenamentos.");
      setSources([]);
      setLibraryItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSources();
  }, [refreshSources]);

  const byType = useMemo(() => {
    const notebook = sources.find((item) => item.type === "notebook");
    const pendrive = sources.find((item) => item.type === "pendrive");
    const drive = sources.find((item) => item.type === "google_drive");

    return [notebook, pendrive, drive].filter(Boolean) as StorageSource[];
  }, [sources]);

  const selectedSource = useMemo(
    () => sources.find((source) => source.type === selectedStorageType) ?? null,
    [sources, selectedStorageType],
  );

  const storageItems = useMemo(() => {
    if (!selectedSource) {
      return [];
    }

    return libraryItems
      .filter((item) => itemBelongsToStorage(item, selectedSource.type))
      .filter((item) => matchesLibraryFilters(item, filters, search));
  }, [libraryItems, selectedSource, filters, search]);

  const storageSummary = useMemo(
    () => ({
      courses: storageItems.filter((item) => item.contentType === "course").length,
      movies: storageItems.filter((item) => item.contentType === "movie").length,
      files: storageItems.filter((item) => item.contentType === "file").length,
      videos: storageItems.filter((item) => isPlayableVideoExtension(item.extension)).length,
      pdfs: storageItems.filter((item) => item.extension.toLowerCase() === ".pdf").length,
      zips: storageItems.filter((item) => item.extension.toLowerCase() === ".zip").length,
    }),
    [storageItems],
  );

  function updatePath(storageType: LocalStorageType, contentType: ContentPathKey, value: string) {
    setPaths((current) => ({
      ...current,
      [storageType]: {
        ...current[storageType],
        [contentType]: value,
      },
    }));
  }

  async function handleSavePaths(storageType: LocalStorageType) {
    setIsBusy(true);
    setFeedback("");

    try {
      await setStoragePaths(storageType, paths[storageType]);
      await refreshSources();
      setFeedback(`Caminhos de ${getStorageLabel(storageType)} atualizados.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Falha ao atualizar caminhos.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleScan(type: "all" | "notebook" | "pendrive") {
    setIsBusy(true);
    setFeedback("");

    try {
      await scanStorage(type);
      await refreshSources();
      setFeedback(`Escaneamento (${type}) concluído.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Falha ao escanear armazenamento.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSyncDrive() {
    setIsBusy(true);
    setFeedback("");

    try {
      const report = await syncDrive();
      await refreshSources();
      setFeedback(`Google Drive sincronizado: ${report.syncedFiles} arquivo(s).`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Falha ao sincronizar Google Drive.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleClearStorageCatalog(source: StorageSource) {
    const typed = window.prompt(
      `Limpar todo o catalogo de ${getStorageLabel(source.type)}?\n\nIsso remove todos os itens indexados deste armazenamento, mas nao apaga arquivos fisicos.\nDigite LIMPAR para confirmar.`,
    );
    if (typed?.trim().toUpperCase() !== "LIMPAR") {
      return;
    }

    setIsBusy(true);
    setFeedback("");

    try {
      const report = await clearStorageContent({
        storageType: source.type,
        deleteFiles: false,
        confirmText: "LIMPAR",
      });
      await refreshSources();
      setFeedback(
        `Catalogo limpo: ${report.removedFromLibrary} item(s) removido(s) e ${report.offlineCopiesCleared} copia(s) offline desassociada(s).`,
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Falha ao limpar catalogo do armazenamento.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleClearStorageFiles(source: StorageSource) {
    if (source.type === "google_drive") {
      setFeedback("Exclusao fisica do Google Drive ainda nao esta implementada.");
      return;
    }

    const typed = window.prompt(
      `Apagar todos os arquivos indexados de ${getStorageLabel(source.type)}?\n\nIsso remove os itens da biblioteca e apaga os arquivos reais encontrados no dispositivo. Arquivos nao indexados nao serao tocados.\nDigite APAGAR ARQUIVOS para confirmar.`,
    );
    if (typed?.trim().toUpperCase() !== "APAGAR ARQUIVOS") {
      return;
    }

    setIsBusy(true);
    setFeedback("");

    try {
      const report = await clearStorageContent({
        storageType: source.type,
        deleteFiles: true,
        confirmText: "APAGAR ARQUIVOS",
      });
      await refreshSources();
      const failureText = report.failedFiles.length ? ` ${report.failedFiles.length} arquivo(s) falharam e foram mantidos no catalogo.` : "";
      setFeedback(
        `Armazenamento limpo: ${report.deletedFiles} arquivo(s) apagado(s), ${report.removedFromLibrary} item(s) removido(s) e ${report.offlineCopiesCleared} copia(s) offline desassociada(s).${failureText}`,
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Falha ao apagar arquivos do armazenamento.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRemoveLibraryItem(item: ApiMediaItem) {
    const confirmed = window.confirm(
      `Remover "${item.title}" da biblioteca?\n\nO arquivo físico continuará no dispositivo.`,
    );
    if (!confirmed) {
      return;
    }

    setIsBusy(true);
    setFeedback("");

    try {
      await removeLibraryItem(item.id);
      setLibraryItems((current) => current.filter((candidate) => candidate.id !== item.id));
      setFeedback("Item removido da biblioteca. O arquivo físico foi mantido.");
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Falha ao remover da biblioteca.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDeletePhysicalFile(item: ApiMediaItem) {
    const typed = window.prompt(
      `Excluir o arquivo físico de "${item.title}"?\n\nIsso remove o item da biblioteca e apaga o arquivo real do dispositivo.\nDigite EXCLUIR para confirmar.`,
    );
    if (typed !== "EXCLUIR") {
      return;
    }

    setIsBusy(true);
    setFeedback("");

    try {
      await deleteLibraryFile(item.id);
      setLibraryItems((current) => current.filter((candidate) => candidate.id !== item.id));
      await refreshSources();
      setFeedback("Arquivo físico excluído e item removido da biblioteca.");
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Falha ao excluir arquivo físico.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <>
      <Header
        title="Armazenamento"
        subtitle="Gerencie caminhos e explore exatamente o que existe em cada local"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar no armazenamento selecionado"
      />

      <div className="page-body space-y-4">
        <section className="panel p-4">
          <h2 className="brand-font text-lg font-semibold text-[var(--text)]">Fontes locais por aba</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Cursos, Filmes e Arquivos podem apontar para pastas diferentes em cada armazenamento.
          </p>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {(["notebook", "pendrive"] as const).map((storageType) => (
              <article key={storageType} className="rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--muted)]">{getStorageLabel(storageType)}</p>
                <div className="mt-3 grid gap-3">
                  {(Object.keys(PATH_LABELS) as ContentPathKey[]).map((contentType) => (
                    <label key={contentType} className="text-sm font-semibold text-[var(--muted)]">
                      {PATH_LABELS[contentType]}
                      <input
                        type="text"
                        value={paths[storageType][contentType]}
                        onChange={(event) => updatePath(storageType, contentType, event.target.value)}
                        placeholder={storageType === "notebook" ? `C:/MediaVault/${PATH_LABELS[contentType]}` : `E:/MediaVault/${PATH_LABELS[contentType]}`}
                        className="text-field mt-1"
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSavePaths(storageType)}
                    disabled={isBusy}
                    className="btn-primary px-3 py-2 text-xs disabled:opacity-50"
                  >
                    Salvar caminhos
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleScan(storageType)}
                    disabled={isBusy}
                    className="btn-secondary px-3 py-2 text-xs disabled:opacity-50"
                  >
                    Escanear
                  </button>
                  <button type="button" onClick={() => setSelectedStorageType(storageType)} className="btn-ghost px-3 py-2 text-xs">
                    Explorar armazenamento
                  </button>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => void handleScan("all")} disabled={isBusy} className="btn-primary px-3 py-2 text-xs disabled:opacity-50">
              Escanear tudo
            </button>
          </div>

          {feedback ? <p className="mt-3 text-sm text-[var(--muted)]">{feedback}</p> : null}
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          {isLoading ? <p className="panel p-4 text-sm text-[var(--muted)]">Carregando armazenamentos...</p> : null}
          {byType.map((source) => (
            <StorageCard
              key={source.id}
              source={source}
              actionDisabled={isBusy || (source.type === "google_drive" && source.status !== "connected")}
              onScan={() => (source.type === "google_drive" ? void handleSyncDrive() : void handleScan(source.type))}
              onSync={() => (source.type === "google_drive" ? void handleSyncDrive() : void handleScan(source.type))}
              onViewContent={() => setSelectedStorageType(source.type)}
              onClearCatalog={() => void handleClearStorageCatalog(source)}
              onClearFiles={source.type === "google_drive" ? undefined : () => void handleClearStorageFiles(source)}
              clearDisabled={isBusy}
            />
          ))}

          {!isLoading && !byType.length ? (
            <p className="panel p-4 text-sm text-[var(--muted)]">Nenhuma fonte cadastrada no backend.</p>
          ) : null}
        </section>

        {selectedSource ? (
          <section className="space-y-4">
            <section className="panel p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">Conteúdo do armazenamento</p>
                  <h2 className="brand-font mt-1 text-2xl font-semibold text-[var(--text)]">
                    {getStorageLabel(selectedSource.type)} · {selectedSource.name}
                  </h2>
                  <p className="mt-1 break-all text-sm text-[var(--muted)]">{selectedSource.path}</p>
                  {selectedSource.type === "google_drive" ? (
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      Google Drive permanece como área preparada; esta rodada não adiciona novos fluxos de Drive real.
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="status-pill">
                    <HardDrive className="inline h-3.5 w-3.5" /> {getStorageStatusLabel(selectedSource.status)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleClearStorageCatalog(selectedSource)}
                    disabled={isBusy}
                    className="btn-danger-soft px-3 py-2 text-xs disabled:opacity-50"
                  >
                    Limpar catálogo
                  </button>
                  {selectedSource.type !== "google_drive" ? (
                    <button
                      type="button"
                      onClick={() => void handleClearStorageFiles(selectedSource)}
                      disabled={isBusy}
                      className="btn-danger-soft px-3 py-2 text-xs disabled:opacity-50"
                    >
                      Apagar arquivos indexados
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                <p className="home-row p-3 text-sm text-[var(--muted)]">Cursos: {storageSummary.courses}</p>
                <p className="home-row p-3 text-sm text-[var(--muted)]">Filmes: {storageSummary.movies}</p>
                <p className="home-row p-3 text-sm text-[var(--muted)]">Arquivos: {storageSummary.files}</p>
                <p className="home-row p-3 text-sm text-[var(--muted)]">Vídeos: {storageSummary.videos}</p>
                <p className="home-row p-3 text-sm text-[var(--muted)]">PDFs: {storageSummary.pdfs}</p>
                <p className="home-row p-3 text-sm text-[var(--muted)]">ZIPs: {storageSummary.zips}</p>
              </div>
            </section>

            <LibraryFilters
              filters={filters}
              onChange={setFilters}
              onClear={() => setFilters(DEFAULT_LIBRARY_FILTERS)}
              resultCount={storageItems.length}
            />

            <div className="space-y-3">
              {storageItems.map((item) => {
                const canPlay = canOpenPlayerForMedia(item);
                const hasPhysicalFile = Boolean(item.localFilePath || item.storageType !== "google_drive");

                return (
                  <article key={item.id} className="panel fancy-enter p-4">
                    <div className="grid gap-4 lg:grid-cols-[96px_minmax(0,1fr)_auto]">
                      <img src={item.thumbnail} alt={item.title} className="h-28 w-full rounded-lg object-cover lg:h-24" loading="lazy" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="status-pill">{getTypeLabel(item.contentType)}</span>
                          <span className="status-pill">{item.extension.toUpperCase()}</span>
                          <span className="status-pill">{getStatusLabel(item.status as Parameters<typeof getStatusLabel>[0])}</span>
                        </div>
                        <h3 className="mt-2 truncate font-semibold text-[var(--text)]" title={item.title}>
                          {item.title}
                        </h3>
                        <p className="mt-1 truncate text-xs text-[var(--muted)]" title={item.fileName}>
                          Arquivo original: {item.fileName}
                        </p>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {item.genre || "Sem gênero"} · {item.collection || "Sem coleção"} · {formatBytes(item.sizeBytes)}
                        </p>
                        <p className="mt-1 break-all text-xs text-[var(--muted)]">Caminho: {item.localFilePath || item.filePath}</p>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          Criado/indexado: {formatDate(item.createdAt)} · Atualizado: {formatDate(item.updatedAt)}
                        </p>
                        <div className="mt-3 max-w-sm">
                          <ProgressBar value={item.progress.percentage} compact />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-start gap-2 lg:w-56">
                        {canPlay ? (
                          <Link to={`/player/local/${item.id}`} className="btn-primary inline-flex items-center gap-1 px-3 py-2 text-xs">
                            <PlayCircle className="h-4 w-4" />
                            Assistir
                          </Link>
                        ) : null}
                        <Link to={`/content/${item.id}`} className="btn-secondary inline-flex items-center gap-1 px-3 py-2 text-xs">
                          <Info className="h-4 w-4" />
                          Detalhes
                        </Link>
                        <button
                          type="button"
                          onClick={() => void handleRemoveLibraryItem(item)}
                          disabled={isBusy}
                          className="btn-danger-soft inline-flex items-center gap-1 px-3 py-2 text-xs disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                          Remover
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeletePhysicalFile(item)}
                          disabled={isBusy || !hasPhysicalFile}
                          className="btn-danger-soft inline-flex items-center gap-1 px-3 py-2 text-xs disabled:opacity-50"
                        >
                          <AlertTriangle className="h-4 w-4" />
                          Excluir arquivo
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}

              {!storageItems.length ? (
                <p className="panel p-4 text-sm text-[var(--muted)]">
                  <FileText className="mr-2 inline h-4 w-4" />
                  Nenhum item encontrado neste armazenamento com os filtros atuais.
                </p>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
