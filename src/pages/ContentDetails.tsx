import { AlertTriangle, FolderOpen, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createDownload,
  deleteLibraryFile,
  getLibrary,
  getLibraryItem,
  openLibraryItem,
  removeLibraryItem,
  revealLibraryItem,
  updateLibraryItem,
  type ApiMediaItem,
} from "../api/client";
import { Header } from "../components/Header";
import { ProgressBar } from "../components/ProgressBar";
import type { MediaStatus } from "../types/content";
import {
  formatBytes,
  formatDateOnly,
  canOpenPlayerForMedia,
  getStatusLabel,
  getStorageIcon,
  getStorageLabel,
  getTypeLabel,
  isOnlinePlayerMedia,
} from "../utils/content";

function normalizeStatus(status: string): MediaStatus {
  const allowed: MediaStatus[] = [
    "available_local",
    "available_pendrive",
    "available_drive",
    "downloading",
    "offline_ready",
    "missing",
    "pendrive_disconnected",
    "error",
  ];

  return allowed.includes(status as MediaStatus) ? (status as MediaStatus) : "available_local";
}

export function ContentDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<ApiMediaItem | null>(null);
  const [related, setRelated] = useState<ApiMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busyDestination, setBusyDestination] = useState<"notebook" | "pendrive" | "">("");
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [genreDraft, setGenreDraft] = useState("");
  const [collectionDraft, setCollectionDraft] = useState("");
  const [collectionOrderDraft, setCollectionOrderDraft] = useState("");
  const [yearDraft, setYearDraft] = useState("");
  const [releaseDateDraft, setReleaseDateDraft] = useState("");
  const [coverPathDraft, setCoverPathDraft] = useState("");
  const [subtitleDraft, setSubtitleDraft] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!id) {
        setLoading(false);
        setError("ID de conteúdo inválido.");
        return;
      }

      setLoading(true);
      setError("");
      setFeedback("");

      try {
        const [currentItem, all] = await Promise.all([getLibraryItem(id), getLibrary()]);

        if (!isMounted) {
          return;
        }

        setItem(currentItem);
        setTitleDraft(currentItem.title);
        setGenreDraft(currentItem.genre);
        setCollectionDraft(currentItem.collection);
        setCollectionOrderDraft(currentItem.collectionOrder ? String(currentItem.collectionOrder) : "");
        setYearDraft(currentItem.year ? String(currentItem.year) : "");
        setReleaseDateDraft(currentItem.releaseDate);
        setCoverPathDraft(currentItem.coverPath);
        setSubtitleDraft(currentItem.subtitlePath);
        setRelated(
          all
            .filter((candidate) => candidate.id !== currentItem.id && candidate.contentType === currentItem.contentType)
            .slice(0, 6),
        );
      } catch (cause) {
        if (isMounted) {
          setError(cause instanceof Error ? cause.message : "Falha ao carregar detalhes.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, [id]);

  const watchRoute = useMemo(() => {
    if (!item || !canOpenPlayerForMedia(item)) {
      return "#";
    }

    return `/player/local/${item.id}`;
  }, [item]);

  async function handleTransfer(destination: "notebook" | "pendrive") {
    if (!item) {
      return;
    }

    setBusyDestination(destination);
    setFeedback("");

    try {
      await createDownload({ mediaItemId: item.id, destinationStorageType: destination });
      setFeedback(`Transferência para ${destination === "notebook" ? "notebook" : "pendrive"} adicionada à fila.`);
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Falha ao criar transferência.");
    } finally {
      setBusyDestination("");
    }
  }

  async function handleSaveMetadata() {
    if (!item) {
      return;
    }

    setIsSavingMetadata(true);
    setFeedback("");

    try {
      const updated = await updateLibraryItem(item.id, {
        title: titleDraft,
        genre: genreDraft,
        collection: collectionDraft,
        collectionOrder: collectionOrderDraft,
        year: yearDraft,
        releaseDate: releaseDateDraft,
        coverPath: coverPathDraft,
        subtitlePath: subtitleDraft,
      });
      setItem(updated);
      setTitleDraft(updated.title);
      setGenreDraft(updated.genre);
      setCollectionDraft(updated.collection);
      setCollectionOrderDraft(updated.collectionOrder ? String(updated.collectionOrder) : "");
      setYearDraft(updated.year ? String(updated.year) : "");
      setReleaseDateDraft(updated.releaseDate);
      setCoverPathDraft(updated.coverPath);
      setSubtitleDraft(updated.subtitlePath);
      setFeedback("Metadados atualizados.");
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Falha ao atualizar metadados.");
    } finally {
      setIsSavingMetadata(false);
    }
  }

  async function handleRevealFolder() {
    if (!item) {
      return;
    }

    setIsRevealing(true);
    setFeedback("");

    try {
      await revealLibraryItem(item.id);
      setFeedback("Pasta aberta no sistema.");
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Abrir pasta local ficará melhor no app desktop.");
    } finally {
      setIsRevealing(false);
    }
  }

  async function handleOpenInSystem() {
    if (!item) {
      return;
    }

    setFeedback("");

    try {
      const result = await openLibraryItem(item.id);
      setFeedback(result.targetType === "drive" ? "Abrindo preview do Google Drive." : "Abrindo no player padrão do sistema.");
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Falha ao abrir mídia.");
    }
  }

  async function handleRemoveFromLibrary() {
    if (!item) {
      return;
    }

    const confirmed = window.confirm(
      `Remover "${item.title}" da biblioteca?\n\nEsta ação remove apenas o cadastro do MediaVault. O arquivo físico continuará no notebook ou pendrive.`,
    );
    if (!confirmed) {
      return;
    }

    setIsRemoving(true);
    setFeedback("");

    try {
      await removeLibraryItem(item.id);
      navigate("/");
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Falha ao remover da biblioteca.");
      setIsRemoving(false);
    }
  }

  async function handleDeletePhysicalFile() {
    if (!item) {
      return;
    }

    const typed = window.prompt(
      `Excluir o arquivo físico de "${item.title}"?\n\nIsso remove o item da biblioteca e apaga o arquivo real do dispositivo.\nDigite EXCLUIR para confirmar.`,
    );
    if (typed !== "EXCLUIR") {
      return;
    }

    setIsRemoving(true);
    setFeedback("");

    try {
      await deleteLibraryFile(item.id);
      navigate("/");
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Falha ao excluir arquivo físico.");
      setIsRemoving(false);
    }
  }

  if (!id) {
    return (
      <>
        <Header title="Conteúdo" subtitle="Detalhes" searchPlaceholder="Buscar" />
        <div className="page-body">
          <p className="panel p-4 text-sm text-[var(--muted)]">ID de conteúdo inválido.</p>
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <Header title="Detalhes" subtitle="Carregando item" searchPlaceholder="Buscar" />
        <div className="page-body">
          <p className="panel p-4 text-sm text-[var(--muted)]">Carregando detalhes do conteúdo...</p>
        </div>
      </>
    );
  }

  if (error || !item) {
    return (
      <>
        <Header title="Conteúdo não encontrado" subtitle="Verifique o ID da rota" searchPlaceholder="Buscar" />
        <div className="page-body">
          <article className="panel p-5 text-sm text-[var(--muted)]">
            <p>{error || `Nenhum conteúdo encontrado para o ID: ${id}`}</p>
            <Link to="/" className="btn-primary mt-3 inline-block px-3 py-2 text-xs">
              Voltar ao início
            </Link>
          </article>
        </div>
      </>
    );
  }

  const itemCanTransfer = item.status !== "missing" && item.status !== "pendrive_disconnected";
  const canTransferToNotebook = itemCanTransfer && item.storageType !== "notebook" && item.localStorageType !== "notebook";
  const canTransferToPendrive = itemCanTransfer && item.storageType !== "pendrive" && item.localStorageType !== "pendrive";
  const canReveal = item.status !== "missing" && item.status !== "pendrive_disconnected" && (item.storageType !== "google_drive" || Boolean(item.localFilePath));
  const canWatch = canOpenPlayerForMedia(item);
  const isOnlinePlayback = isOnlinePlayerMedia(item);
  const hasPhysicalFile = Boolean(item.localFilePath || item.storageType !== "google_drive");

  return (
    <>
      <Header title={item.title} subtitle="Centro de gerenciamento do material" searchPlaceholder="Buscar item" />

      <div className="page-body space-y-5">
        <section className="panel fancy-enter overflow-hidden">
          <div className="grid gap-4 p-4 md:grid-cols-[300px_minmax(0,1fr)]">
            <img src={item.thumbnail} alt={item.title} className="h-64 w-full rounded-xl object-cover md:h-full" />

            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">{getTypeLabel(item.contentType)}</p>
              <h2 className="brand-font mt-1 text-3xl font-semibold text-[var(--text)]">{item.title}</h2>
              <p className="mt-3 text-sm text-[var(--muted)]">{item.description}</p>

              <div className="mt-4 grid gap-2 text-sm text-[var(--muted)] md:grid-cols-2">
                <p>
                  <strong>Gênero:</strong> {item.genre || "Sem gênero"}
                </p>
                <p>
                  <strong>Coleção/trilogia:</strong> {item.collection || "Sem coleção"}
                  {item.collectionOrder ? ` #${item.collectionOrder}` : ""}
                </p>
                <p>
                  <strong>Ano:</strong> {item.year ?? "--"}
                </p>
                <p>
                  <strong>Data:</strong> {item.releaseDate ? formatDateOnly(item.releaseDate) : "--"}
                </p>
                <p>
                  <strong>Categoria:</strong> {item.category}
                </p>
                <p>
                  <strong>Status:</strong> {getStatusLabel(normalizeStatus(item.status))}
                </p>
                <p>
                  <strong>Armazenamento:</strong> {getStorageIcon(item.storageType)} {getStorageLabel(item.storageType)}
                </p>
                {item.localStorageType ? (
                  <p>
                    <strong>Offline em:</strong> {getStorageLabel(item.localStorageType)}
                  </p>
                ) : null}
                <p>
                  <strong>Duração:</strong> {item.durationLabel}
                </p>
                <p className="truncate" title={item.fileName}>
                  <strong>Arquivo original:</strong> {item.fileName}
                </p>
                <p>
                  <strong>Formato:</strong> {item.extension.toUpperCase()} · {item.mimeType}
                </p>
                <p>
                  <strong>Tamanho:</strong> {formatBytes(item.sizeBytes)}
                </p>
                <p>
                  <strong>Fonte:</strong> {item.sourceName || getStorageLabel(item.storageType)}
                </p>
              </div>

              <p className="mt-3 break-all text-xs text-[var(--muted)]">
                <strong>Caminho:</strong> {item.filePath}
              </p>
              {item.localFilePath ? (
                <p className="mt-2 break-all text-xs text-[var(--muted)]">
                  <strong>Cópia offline:</strong> {item.localFilePath}
                </p>
              ) : null}
              <p className="mt-2 break-all text-xs text-[var(--muted)]">
                <strong>Capa:</strong> {item.coverPath || "Capa padrão do MediaVault"}
              </p>

              <div className="mt-4 max-w-xs">
                <ProgressBar value={item.progress.percentage} />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleTransfer("notebook")}
                  disabled={!canTransferToNotebook || busyDestination === "notebook"}
                  className="btn-primary px-3 py-2 text-xs disabled:opacity-50"
                >
                  Baixar para notebook
                </button>
                <button
                  type="button"
                  onClick={() => void handleTransfer("pendrive")}
                  disabled={!canTransferToPendrive || busyDestination === "pendrive"}
                  className="btn-secondary px-3 py-2 text-xs disabled:opacity-50"
                >
                  Copiar para pendrive
                </button>
                {canWatch ? (
                  <Link to={watchRoute} className="btn-ghost px-3 py-2 text-xs">
                    {isOnlinePlayback ? "Assistir online" : "Assistir"}
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleRevealFolder()}
                  disabled={!canReveal || isRevealing}
                  className="btn-secondary inline-flex items-center gap-1 px-3 py-2 text-xs disabled:opacity-50"
                >
                  <FolderOpen className="h-4 w-4" />
                  Abrir pasta
                </button>
                <button
                  type="button"
                  onClick={() => void handleOpenInSystem()}
                  className="btn-secondary inline-flex items-center gap-1 px-3 py-2 text-xs"
                >
                  {item.storageType === "google_drive" && !item.localFilePath ? "Abrir no Drive" : "Abrir no player externo"}
                </button>
              </div>

              {feedback ? <p className="mt-3 text-xs text-[var(--muted)]">{feedback}</p> : null}
            </div>
          </div>
        </section>

        <section className="panel p-4">
          <h3 className="brand-font text-xl font-semibold text-[var(--text)]">Metadados editáveis</h3>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <label className="text-sm font-semibold text-[var(--muted)]">
              {item.contentType === "movie" ? "Nome/título do filme" : "Nome/título exibido"}
              <input
                type="text"
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                className="text-field mt-1"
                placeholder="Ex.: Blade Runner 2049"
              />
            </label>
            <label className="text-sm font-semibold text-[var(--muted)]">
              Gênero
              <input
                type="text"
                value={genreDraft}
                onChange={(event) => setGenreDraft(event.target.value)}
                className="text-field mt-1"
                placeholder="Ex.: Ficção científica, Drama, Ação"
              />
            </label>
            <label className="text-sm font-semibold text-[var(--muted)]">
              Coleção/trilogia
              <input
                type="text"
                value={collectionDraft}
                onChange={(event) => setCollectionDraft(event.target.value)}
                className="text-field mt-1"
                placeholder="Ex.: O Senhor dos Anéis"
              />
            </label>
            <label className="text-sm font-semibold text-[var(--muted)]">
              Ordem na coleção
              <input
                type="number"
                min="0"
                value={collectionOrderDraft}
                onChange={(event) => setCollectionOrderDraft(event.target.value)}
                className="text-field mt-1"
                placeholder="Ex.: 1"
              />
            </label>
            <label className="text-sm font-semibold text-[var(--muted)]">
              Ano
              <input
                type="number"
                min="1888"
                max="2200"
                value={yearDraft}
                onChange={(event) => setYearDraft(event.target.value)}
                className="text-field mt-1"
                placeholder="Ex.: 2014"
              />
            </label>
            <label className="text-sm font-semibold text-[var(--muted)]">
              Data
              <input
                type="date"
                value={releaseDateDraft}
                onChange={(event) => setReleaseDateDraft(event.target.value)}
                className="text-field mt-1"
              />
            </label>
            <label className="text-sm font-semibold text-[var(--muted)]">
              Caminho da capa
              <input
                type="text"
                value={coverPathDraft}
                onChange={(event) => setCoverPathDraft(event.target.value)}
                className="text-field mt-1"
                placeholder="C:/MediaVault/Filmes/Interstellar.jpg"
              />
            </label>
            <label className="text-sm font-semibold text-[var(--muted)]">
              Legenda .vtt associada
              <input
                type="text"
                value={subtitleDraft}
                onChange={(event) => setSubtitleDraft(event.target.value)}
                className="text-field mt-1"
                placeholder="C:/MediaVault/Filmes/Interstellar.pt-BR.vtt"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => void handleSaveMetadata()}
            disabled={isSavingMetadata}
            className="btn-primary mt-4 inline-flex items-center gap-2 px-3 py-2 text-xs disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Salvar metadados
          </button>
        </section>

        <section className="panel border-rose-400/30 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="brand-font text-xl font-semibold text-[var(--text)]">Zona de exclusão</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Remover da biblioteca apaga só o catálogo. Excluir arquivo do dispositivo apaga o arquivo físico e também remove o item do MediaVault.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleRemoveFromLibrary()}
                disabled={isRemoving}
                className="btn-danger-soft inline-flex items-center gap-2 px-3 py-2 text-xs disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Remover da biblioteca
              </button>
              <button
                type="button"
                onClick={() => void handleDeletePhysicalFile()}
                disabled={isRemoving || !hasPhysicalFile}
                className="btn-danger-soft inline-flex items-center gap-2 px-3 py-2 text-xs disabled:opacity-50"
              >
                <AlertTriangle className="h-4 w-4" />
                Excluir arquivo do dispositivo
              </button>
            </div>
          </div>
        </section>

        <section>
          <h3 className="brand-font mb-3 text-xl font-semibold text-[var(--text)]">Itens relacionados</h3>
          {related.length ? (
            <div className="space-y-3">
              {related.map((candidate, index) => (
                <article key={candidate.id} className="panel fancy-enter p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-[var(--muted)]">#{index + 1}</p>
                      <h4 className="truncate font-semibold text-[var(--text)]">{candidate.title}</h4>
                      <p className="truncate text-xs text-[var(--muted)]">{candidate.fileName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {canOpenPlayerForMedia(candidate) ? (
                        <Link to={`/player/local/${candidate.id}`} className="btn-primary px-3 py-2 text-xs">
                          {isOnlinePlayerMedia(candidate) ? "Online" : "Assistir"}
                        </Link>
                      ) : null}
                      <Link to={`/content/${candidate.id}`} className="btn-secondary px-3 py-2 text-xs">
                        Detalhes
                      </Link>
                    </div>
                  </div>
                  <div className="mt-3 max-w-sm">
                    <ProgressBar value={candidate.progress.percentage} compact />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="panel p-4 text-sm text-[var(--muted)]">Nenhum item relacionado no mesmo tipo de conteúdo.</p>
          )}
        </section>
      </div>
    </>
  );
}
