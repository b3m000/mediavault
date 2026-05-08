import { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "../components/Header";
import { StorageCard } from "../components/StorageCard";
import { getStorageSources, scanStorage, setNotebookSource, setPendriveSource, type ApiStorageSource } from "../api/client";
import type { StorageSource } from "../types/content";

function toGb(bytes = 0): number {
  return Number((bytes / 1024 / 1024 / 1024).toFixed(2));
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
    usedSpaceGb: toGb(source.usedBytes ?? 0),
    totalSpaceGb: totalSpaceByType[source.type],
    lastSyncAt: source.last_scan_at ? source.last_scan_at.replace("T", " ").slice(0, 16) : "--",
  };
}

export function Storage() {
  const [sources, setSources] = useState<StorageSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [feedback, setFeedback] = useState<string>("");
  const [notebookPath, setNotebookPath] = useState("");
  const [pendrivePath, setPendrivePath] = useState("");

  const refreshSources = useCallback(async () => {
    try {
      const apiSources = await getStorageSources();
      const mapped = apiSources.map(mapApiToStorageSource);
      setSources(mapped);

      const notebook = apiSources.find((item) => item.type === "notebook");
      const pendrive = apiSources.find((item) => item.type === "pendrive");

      if (notebook) {
        setNotebookPath(notebook.path);
      }

      if (pendrive) {
        setPendrivePath(pendrive.path);
      }
    } catch {
      setFeedback("Backend indisponivel. Nao foi possivel carregar armazenamentos.");
      setSources([]);
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

  async function handleSaveNotebookPath(customPath?: string) {
    setIsBusy(true);
    setFeedback("");

    try {
      const targetPath = customPath ?? notebookPath;
      await setNotebookSource(targetPath);
      await refreshSources();
      setFeedback("Pasta do notebook atualizada com sucesso.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Falha ao atualizar pasta do notebook.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSavePendrivePath(customPath?: string) {
    setIsBusy(true);
    setFeedback("");

    try {
      const targetPath = customPath ?? pendrivePath;
      await setPendriveSource(targetPath);
      await refreshSources();
      setFeedback("Pasta do pendrive atualizada com sucesso.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Falha ao atualizar pasta do pendrive.");
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
      setFeedback(`Escaneamento (${type}) concluido.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Falha ao escanear armazenamento.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <>
      <Header title="Armazenamento" subtitle="Estado de notebook, pendrive e Google Drive" searchPlaceholder="Buscar origem" />

      <div className="page-body space-y-4">
        <section className="panel p-4">
          <h2 className="brand-font text-lg font-semibold text-[var(--text)]">Configuracao de fontes locais</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Defina os caminhos de notebook e pendrive para o scanner local e o player real.
          </p>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <article className="rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--muted)]">Notebook</p>
              <input
                type="text"
                value={notebookPath}
                onChange={(event) => setNotebookPath(event.target.value)}
                placeholder="C:/MediaVault"
                className="text-field mt-2"
              />
              <div className="mt-2">
                <button type="button" onClick={() => void handleSaveNotebookPath()} disabled={isBusy} className="btn-primary px-3 py-2 text-xs disabled:opacity-50">
                  Salvar caminho
                </button>
              </div>
            </article>

            <article className="rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--muted)]">Pendrive</p>
              <input
                type="text"
                value={pendrivePath}
                onChange={(event) => setPendrivePath(event.target.value)}
                placeholder="E:/MediaVault"
                className="text-field mt-2"
              />
              <div className="mt-2">
                <button type="button" onClick={() => void handleSavePendrivePath()} disabled={isBusy} className="btn-primary px-3 py-2 text-xs disabled:opacity-50">
                  Salvar caminho
                </button>
              </div>
            </article>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => void handleScan("all")} disabled={isBusy} className="btn-primary px-3 py-2 text-xs disabled:opacity-50">
              Escanear tudo
            </button>
            <button type="button" onClick={() => void handleScan("notebook")} disabled={isBusy} className="btn-secondary px-3 py-2 text-xs disabled:opacity-50">
              Escanear notebook
            </button>
            <button type="button" onClick={() => void handleScan("pendrive")} disabled={isBusy} className="btn-secondary px-3 py-2 text-xs disabled:opacity-50">
              Escanear pendrive
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
              actionDisabled={isBusy}
              onScan={() => void handleScan(source.type === "google_drive" ? "all" : source.type)}
              onSync={() => void handleScan(source.type === "google_drive" ? "all" : source.type)}
              onChangePath={() => {
                const currentValue = source.type === "notebook" ? notebookPath : pendrivePath;
                const nextPath = window.prompt("Novo caminho da fonte", currentValue);

                if (!nextPath) {
                  return;
                }

                if (source.type === "notebook") {
                  setNotebookPath(nextPath);
                  void handleSaveNotebookPath(nextPath);
                  return;
                }

                if (source.type === "pendrive") {
                  setPendrivePath(nextPath);
                  void handleSavePendrivePath(nextPath);
                }
              }}
            />
          ))}

          {!isLoading && !byType.length ? (
            <p className="panel p-4 text-sm text-[var(--muted)]">Nenhuma fonte cadastrada no backend.</p>
          ) : null}
        </section>
      </div>
    </>
  );
}
