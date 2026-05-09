import { Download, FolderOpen, Info, PlayCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { createDownload, removeLibraryItem, revealLibraryItem } from "../api/client";
import type { MediaContent } from "../types/content";
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
import { ProgressBar } from "./ProgressBar";

interface ContentCardProps {
  content: MediaContent;
  onRemoved?: (id: string) => void;
  enableRemoveAction?: boolean;
}

export function ContentCard({ content, onRemoved, enableRemoveAction = false }: ContentCardProps) {
  const [feedback, setFeedback] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const canPlay = canOpenPlayerForMedia({
    extension: content.fileType,
    storage: content.storage,
    localFilePath: content.localFilePath,
    driveFileId: content.driveFileId,
  });
  const isOnlinePlayback = isOnlinePlayerMedia({
    extension: content.fileType,
    storage: content.storage,
    localFilePath: content.localFilePath,
    driveFileId: content.driveFileId,
  });
  const canTransfer = content.status !== "missing" && content.status !== "pendrive_disconnected";
  const destination = content.storage === "notebook" || content.localStorage === "notebook" ? "pendrive" : "notebook";
  const canReveal = Boolean(content.localFilePath || content.storage !== "google_drive") && content.status !== "missing" && content.status !== "pendrive_disconnected";

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

  async function handleRevealFolder() {
    setIsRevealing(true);
    setFeedback("");

    try {
      await revealLibraryItem(content.id);
      setFeedback("Pasta aberta no sistema.");
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Abrir pasta local ficará melhor no app desktop.");
    } finally {
      setIsRevealing(false);
    }
  }

  async function handleRemoveFromLibrary() {
    const confirmed = window.confirm(
      `Remover "${content.title}" da biblioteca?\n\nO arquivo físico continuará no dispositivo.`,
    );
    if (!confirmed) {
      return;
    }

    setIsRemoving(true);
    setFeedback("");

    try {
      await removeLibraryItem(content.id);
      setFeedback("Item removido da biblioteca. O arquivo físico foi mantido.");
      onRemoved?.(content.id);
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Falha ao remover da biblioteca.");
    } finally {
      setIsRemoving(false);
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
        <div className="mt-2 flex flex-wrap gap-2">
          {content.genre ? <span className="status-pill">{content.genre}</span> : null}
          {content.collection ? <span className="status-pill">{content.collection}</span> : null}
        </div>

        <div className="mt-3 space-y-1.5 text-xs text-[var(--muted)]">
          {content.fileName ? (
            <p className="truncate" title={content.fileName}>
              <span className="font-semibold">Arquivo:</span> {content.fileName}
            </p>
          ) : null}
          {content.filePath ? (
            <p className="truncate" title={content.filePath}>
              <span className="font-semibold">Caminho:</span> {content.filePath}
            </p>
          ) : null}
          <p>
            <span className="font-semibold">Status:</span> {getStatusLabel(content.status)}
          </p>
          <p>
            <span className="font-semibold">Armazenamento:</span> {getStorageIcon(content.storage)} {getStorageLabel(content.storage)}
          </p>
          {content.localStorage ? (
            <p>
              <span className="font-semibold">Offline em:</span> {getStorageLabel(content.localStorage)}
            </p>
          ) : null}
          {content.sizeBytes ? (
            <p>
              <span className="font-semibold">Tamanho:</span> {formatBytes(content.sizeBytes)}
            </p>
          ) : null}
          {content.releaseDate || content.year ? (
            <p>
              <span className="font-semibold">Data:</span> {content.releaseDate ? formatDateOnly(content.releaseDate) : content.year}
            </p>
          ) : null}
          {content.fileType ? (
            <p>
              <span className="font-semibold">Formato:</span> {content.fileType.toUpperCase()}
            </p>
          ) : null}
        </div>

        <div className="mt-3">
          <ProgressBar value={content.progress} compact />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {canPlay ? (
            <Link to={`/player/local/${content.id}`} className="btn-primary inline-flex items-center justify-center gap-1 px-3 py-2 text-center text-sm">
              <PlayCircle className="h-4 w-4" />
              {isOnlinePlayback ? "Online" : "Assistir"}
            </Link>
          ) : (
            <Link to={`/content/${content.id}`} className="btn-primary inline-flex items-center justify-center gap-1 px-3 py-2 text-center text-sm">
              <Info className="h-4 w-4" />
              Abrir
            </Link>
          )}
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={!canTransfer || isDownloading}
            className="btn-secondary inline-flex items-center justify-center gap-1 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {isDownloading ? "Fila..." : destination === "notebook" ? "Notebook" : "Pendrive"}
          </button>
          <Link to={`/content/${content.id}`} className="btn-ghost inline-flex items-center justify-center gap-1 px-3 py-2 text-center text-sm">
            <Info className="h-4 w-4" />
            Detalhes
          </Link>
          <button
            type="button"
            onClick={() => void handleRevealFolder()}
            disabled={isRevealing || !canReveal}
            className="btn-secondary inline-flex items-center justify-center gap-1 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FolderOpen className="h-4 w-4" />
            Pasta
          </button>
        </div>

        {enableRemoveAction ? (
          <button
            type="button"
            onClick={() => void handleRemoveFromLibrary()}
            disabled={isRemoving}
            className="btn-danger-soft mt-2 inline-flex items-center justify-center gap-1 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Remover da biblioteca
          </button>
        ) : null}

        {feedback ? <p className="mt-3 text-xs text-[var(--muted)]">{feedback}</p> : null}
      </div>
    </article>
  );
}
