import { useState } from "react";
import { Link } from "react-router-dom";
import { createDownload } from "../api/client";
import type { MediaContent } from "../types/content";
import { getStatusLabel, getStorageIcon, getStorageLabel, getTypeLabel, isPlayableVideoExtension } from "../utils/content";
import { ProgressBar } from "./ProgressBar";

interface ContentCardProps {
  content: MediaContent;
}

export function ContentCard({ content }: ContentCardProps) {
  const [feedback, setFeedback] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const canPlay = isPlayableVideoExtension(content.fileType);
  const canTransfer = content.status !== "missing" && content.status !== "pendrive_disconnected" && content.storage !== "google_drive";
  const destination = content.storage === "notebook" ? "pendrive" : "notebook";

  async function handleDownload() {
    setIsDownloading(true);
    setFeedback("");

    try {
      await createDownload({ mediaItemId: content.id, destinationStorageType: destination });
      setFeedback(`Transferência para ${destination === "notebook" ? "notebook" : "pendrive"} adicionada.`);
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Falha ao criar download.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <article className="panel panel-hover fancy-enter flex h-full flex-col overflow-hidden">
      <div className="relative h-36 overflow-hidden bg-[var(--surface-soft)]">
        <img src={content.thumbnail} alt={content.title} className="h-full w-full object-cover" loading="lazy" />
        <span className="status-pill absolute left-3 top-3">{getTypeLabel(content.type)}</span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="brand-font text-lg font-semibold leading-tight text-[var(--text)]">{content.title}</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">{content.category}</p>

        <div className="mt-3 space-y-2 text-xs text-[var(--muted)]">
          <p>
            <span className="font-semibold">Status:</span> {getStatusLabel(content.status)}
          </p>
          <p>
            <span className="font-semibold">Armazenamento:</span> {getStorageIcon(content.storage)} {getStorageLabel(content.storage)}
          </p>
        </div>

        <div className="mt-3">
          <ProgressBar value={content.progress} compact />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {canPlay ? (
            <Link to={`/player/local/${content.id}`} className="btn-primary px-3 py-2 text-center text-sm">
              Assistir
            </Link>
          ) : (
            <Link to={`/content/${content.id}`} className="btn-primary px-3 py-2 text-center text-sm">
              Abrir
            </Link>
          )}
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={!canTransfer || isDownloading}
            className="btn-secondary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDownloading ? "Adicionando..." : `Baixar para ${destination === "notebook" ? "notebook" : "pendrive"}`}
          </button>
          <Link to={`/content/${content.id}`} className="btn-ghost col-span-2 px-3 py-2 text-center text-sm">
            Ver detalhes
          </Link>
        </div>

        {feedback ? <p className="mt-3 text-xs text-[var(--muted)]">{feedback}</p> : null}
      </div>
    </article>
  );
}
