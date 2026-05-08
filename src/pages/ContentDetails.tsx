import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { createDownload, getLibrary, getLibraryItem, type ApiMediaItem } from "../api/client";
import { Header } from "../components/Header";
import { ProgressBar } from "../components/ProgressBar";
import type { MediaStatus } from "../types/content";
import { getStatusLabel, getStorageIcon, getStorageLabel, getTypeLabel, isPlayableVideoExtension } from "../utils/content";

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
  const [item, setItem] = useState<ApiMediaItem | null>(null);
  const [related, setRelated] = useState<ApiMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busyDestination, setBusyDestination] = useState<"notebook" | "pendrive" | "">("");

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
    if (!item || !isPlayableVideoExtension(item.extension)) {
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

  const itemCanTransfer = item.status !== "missing" && item.status !== "pendrive_disconnected" && item.storageType !== "google_drive";
  const canTransferToNotebook = itemCanTransfer && item.storageType !== "notebook";
  const canTransferToPendrive = itemCanTransfer && item.storageType !== "pendrive";

  return (
    <>
      <Header title={item.title} subtitle="Detalhes do conteúdo" searchPlaceholder="Buscar item" />

      <div className="page-body space-y-5">
        <section className="panel fancy-enter overflow-hidden">
          <div className="grid gap-4 p-4 md:grid-cols-[280px_minmax(0,1fr)]">
            <img src={item.thumbnail} alt={item.title} className="h-48 w-full rounded-xl object-cover md:h-full" />

            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">{getTypeLabel(item.contentType)}</p>
              <h2 className="brand-font mt-1 text-3xl font-semibold text-[var(--text)]">{item.title}</h2>
              <p className="mt-3 text-sm text-[var(--muted)]">{item.description}</p>

              <div className="mt-4 grid gap-2 text-sm text-[var(--muted)] md:grid-cols-2">
                <p>
                  <strong>Categoria:</strong> {item.category}
                </p>
                <p>
                  <strong>Status:</strong> {getStatusLabel(normalizeStatus(item.status))}
                </p>
                <p>
                  <strong>Armazenamento:</strong> {getStorageIcon(item.storageType)} {getStorageLabel(item.storageType)}
                </p>
                <p>
                  <strong>Duração:</strong> {item.durationLabel}
                </p>
              </div>

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
                  Baixar para pendrive
                </button>
                {isPlayableVideoExtension(item.extension) ? (
                  <Link to={watchRoute} className="btn-ghost px-3 py-2 text-xs">
                    Assistir
                  </Link>
                ) : null}
              </div>

              {feedback ? <p className="mt-3 text-xs text-[var(--muted)]">{feedback}</p> : null}
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
                    <div>
                      <p className="text-xs text-[var(--muted)]">#{index + 1}</p>
                      <h4 className="font-semibold text-[var(--text)]">{candidate.title}</h4>
                      <p className="text-xs text-[var(--muted)]">{candidate.durationLabel}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isPlayableVideoExtension(candidate.extension) ? (
                        <Link to={`/player/local/${candidate.id}`} className="btn-primary px-3 py-2 text-xs">
                          Assistir
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
