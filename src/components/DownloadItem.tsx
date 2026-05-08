import type { DownloadItem as DownloadItemType } from "../types/content";
import { getDownloadStatusLabel, getStorageLabel } from "../utils/content";
import { ProgressBar } from "./ProgressBar";

interface DownloadItemProps {
  download: DownloadItemType;
  onPause?: () => void;
  onCancel?: () => void;
  actionDisabled?: boolean;
}

export function DownloadItem({ download, onPause, onCancel, actionDisabled = false }: DownloadItemProps) {
  const canPause = download.status === "downloading" && Boolean(onPause);
  const canCancel = download.status !== "completed" && download.status !== "cancelled";

  return (
    <article className="panel panel-hover fancy-enter p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-[var(--text)]">{download.title}</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {getStorageLabel(download.source)} → {getStorageLabel(download.destination)}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">Tamanho: {download.size}</p>
        </div>
        <span className="status-pill">
          {getDownloadStatusLabel(download.status)}
        </span>
      </div>

      <div className="mt-3">
        <ProgressBar value={download.progress} tone={download.status === "completed" ? "success" : "brand"} />
      </div>

      <p className="mt-1 text-xs text-[var(--muted)]">Transferido: {download.speed ?? "--"}</p>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={!canPause || actionDisabled}
          onClick={onPause}
          className="btn-secondary px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40"
        >
          Pausar
        </button>
        <button
          type="button"
          disabled={!canCancel || actionDisabled}
          onClick={onCancel}
          className="btn-danger-soft px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40"
        >
          Cancelar
        </button>
      </div>
    </article>
  );
}
