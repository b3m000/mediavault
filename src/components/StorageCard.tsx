import type { StorageSource } from "../types/content";
import { getStorageIcon, getStorageLabel, getStorageStatusLabel, getUsedSpacePercentage } from "../utils/content";
import { ProgressBar } from "./ProgressBar";

interface StorageCardProps {
  source: StorageSource;
  onScan?: () => void;
  onSync?: () => void;
  onChangePath?: () => void;
  onViewContent?: () => void;
  onClearCatalog?: () => void;
  onClearFiles?: () => void;
  actionDisabled?: boolean;
  clearDisabled?: boolean;
}

export function StorageCard({
  source,
  onScan,
  onSync,
  onChangePath,
  onViewContent,
  onClearCatalog,
  onClearFiles,
  actionDisabled = false,
  clearDisabled = false,
}: StorageCardProps) {
  const percentage = getUsedSpacePercentage(source);

  return (
    <article className="panel panel-hover fancy-enter p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{getStorageLabel(source.type)}</p>
          <h3 className="brand-font text-xl font-semibold text-[var(--text)]">{source.name}</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">{source.path}</p>
          {source.role ? <p className="mt-1 text-xs text-[var(--muted)]">{source.role === "primary" ? "Biblioteca mestre" : "Cache offline"}</p> : null}
        </div>
        <span className="status-pill">
          {getStorageIcon(source.type)} {getStorageStatusLabel(source.status)}
        </span>
      </div>

      <div className="mt-4">
        <ProgressBar value={percentage} tone="warning" />
      </div>

      <p className="mt-1 text-xs text-[var(--muted)]">
        {source.usedSpaceGb}GB usados de {source.totalSpaceGb}GB
      </p>
      <p className="mt-1 text-xs text-[var(--muted)]">Última sincronização: {source.lastSyncAt}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn-primary px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50" type="button" onClick={onScan} disabled={actionDisabled}>
          Escanear arquivos
        </button>
        <button className="btn-secondary px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50" type="button" onClick={onSync} disabled={actionDisabled}>
          Sincronizar índice
        </button>
        {onChangePath ? (
          <button className="btn-secondary px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50" type="button" onClick={onChangePath} disabled={actionDisabled}>
            Alterar pasta
          </button>
        ) : null}
        {onViewContent ? (
          <button className="btn-ghost px-3 py-2 text-xs" type="button" onClick={onViewContent}>
            Ver conteúdo
          </button>
        ) : null}
        {onClearCatalog ? (
          <button className="btn-danger-soft px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50" type="button" onClick={onClearCatalog} disabled={clearDisabled}>
            Limpar catálogo
          </button>
        ) : null}
        {onClearFiles ? (
          <button className="btn-danger-soft px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50" type="button" onClick={onClearFiles} disabled={clearDisabled}>
            Apagar arquivos
          </button>
        ) : null}
      </div>
    </article>
  );
}
