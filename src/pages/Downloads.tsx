import { useCallback, useEffect, useMemo, useState } from "react";
import { cancelDownload, getDownloads, type ApiDownloadItem } from "../api/client";
import { DownloadItem } from "../components/DownloadItem";
import { Header } from "../components/Header";
import type { DownloadItem as DownloadItemType } from "../types/content";

function mapApiDownload(item: ApiDownloadItem): DownloadItemType {
  return {
    id: item.id,
    contentId: item.mediaItemId,
    title: item.title,
    source: item.source,
    destination: item.destination,
    progress: item.progress,
    status: item.status,
    size: item.size,
    speed: `${Math.max(0, Number((item.copiedBytes / 1024 / 1024).toFixed(1)))} MB de ${Math.max(0, Number((item.sizeBytes / 1024 / 1024).toFixed(1)))} MB`,
  };
}

export function Downloads() {
  const [downloads, setDownloads] = useState<ApiDownloadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string>("");

  const refresh = useCallback(async () => {
    try {
      const data = await getDownloads();
      setDownloads(data);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar downloads.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const timer = window.setInterval(() => {
      void refresh();
    }, 2000);

    return () => {
      window.clearInterval(timer);
    };
  }, [refresh]);

  const mapped = useMemo(() => downloads.map(mapApiDownload), [downloads]);

  const activeDownloads = mapped.filter((item) => item.status !== "completed" && item.status !== "cancelled");
  const completedDownloads = mapped.filter((item) => item.status === "completed" || item.status === "cancelled");

  async function handleCancel(downloadId: string) {
    setBusyId(downloadId);
    try {
      await cancelDownload(downloadId);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao cancelar download.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <>
      <Header title="Downloads" subtitle="Fila real de transferências" searchPlaceholder="Buscar na fila" />

      <div className="page-body space-y-6">
        {loading ? <p className="panel p-4 text-sm text-[var(--muted)]">Carregando fila de downloads...</p> : null}
        {error ? <p className="panel p-4 text-sm text-rose-300">{error}</p> : null}

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="brand-font text-xl font-semibold text-[var(--text)]">Em andamento</h2>
            <p className="text-xs text-[var(--muted)]">{activeDownloads.length} item(ns)</p>
          </div>

          <div className="space-y-3">
            {activeDownloads.map((download) => (
              <DownloadItem
                key={download.id}
                download={download}
                onCancel={() => void handleCancel(download.id)}
                actionDisabled={busyId === download.id}
              />
            ))}
            {!loading && !activeDownloads.length ? (
              <p className="panel p-4 text-sm text-[var(--muted)]">Sem downloads ativos no momento.</p>
            ) : null}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="brand-font text-xl font-semibold text-[var(--text)]">Histórico concluído</h2>
            <p className="text-xs text-[var(--muted)]">{completedDownloads.length} item(ns)</p>
          </div>

          <div className="space-y-3">
            {completedDownloads.map((download) => (
              <DownloadItem key={download.id} download={download} />
            ))}
            {!loading && !completedDownloads.length ? (
              <p className="panel p-4 text-sm text-[var(--muted)]">Ainda não há downloads concluídos.</p>
            ) : null}
          </div>
        </section>
      </div>
    </>
  );
}
