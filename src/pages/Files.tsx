import { useEffect, useMemo, useState } from "react";
import { FileArchive, FileText, FileType2, Film, Folder } from "lucide-react";
import { Link } from "react-router-dom";
import { getLibrary, type ApiMediaItem } from "../api/client";
import { Header } from "../components/Header";
import { ProgressBar } from "../components/ProgressBar";
import { getStorageLabel, isPlayableVideoExtension } from "../utils/content";

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
      return Film;
    default:
      return FileType2;
  }
}

export function Files() {
  const [search, setSearch] = useState("");
  const [fileType, setFileType] = useState("all");
  const [items, setItems] = useState<ApiMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  const typeOptions = useMemo(() => {
    const values = new Set(items.map((item) => resolveExtensionLabel(item.fileName)));
    return ["all", ...Array.from(values)];
  }, [items]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    return items.filter((item) => {
      const extension = resolveExtensionLabel(item.fileName);
      const matchesType = fileType === "all" || extension === fileType;
      const matchesSearch = !term || item.title.toLowerCase().includes(term) || item.fileName.toLowerCase().includes(term);
      return matchesType && matchesSearch;
    });
  }, [items, search, fileType]);

  return (
    <>
      <Header
        title="Arquivos"
        subtitle="Biblioteca real escaneada localmente"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar arquivo"
      />

      <div className="page-body space-y-4">
        <section className="panel p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <label className="text-sm font-semibold text-[var(--muted)]">
              Tipo de arquivo
              <select value={fileType} onChange={(event) => setFileType(event.target.value)} className="select-field mt-1">
                {typeOptions.map((item) => (
                  <option key={item} value={item}>
                    {item === "all" ? "Todos" : item.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-[var(--muted)] md:ml-auto">{filtered.length} item(ns) reais</p>
          </div>
        </section>

        {loading ? <p className="panel p-4 text-sm text-[var(--muted)]">Carregando arquivos...</p> : null}
        {error ? <p className="panel p-4 text-sm text-rose-300">{error}</p> : null}

        <section>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((file) => {
              const extension = resolveExtensionLabel(file.fileName);
              const Icon = resolveExtensionIcon(extension);
              const canPlay = isPlayableVideoExtension(file.extension);

              return (
                <article key={file.id} className="panel panel-hover fancy-enter p-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-[var(--surface-strong)] p-3 text-slate-200">
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--text)]">{file.fileName}</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {extension.toUpperCase()} - {getStorageLabel(file.storageType)}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">Status: {file.status}</p>
                    </div>
                  </div>

                  <div className="mt-3">
                    <ProgressBar value={file.progress.percentage} compact />
                  </div>

                  <div className={`mt-4 grid gap-2 ${canPlay ? "grid-cols-2" : "grid-cols-1"}`}>
                    {canPlay ? (
                      <Link to={`/player/local/${file.id}`} className="btn-primary px-3 py-2 text-center text-xs">
                        Abrir player
                      </Link>
                    ) : null}
                    <Link to={`/content/${file.id}`} className="btn-secondary px-3 py-2 text-center text-xs">
                      Detalhes
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>

          {!loading && !error && !filtered.length ? (
            <p className="panel p-4 text-sm text-[var(--muted)]">Nenhum arquivo local encontrado para os filtros atuais.</p>
          ) : null}
        </section>

        <section className="panel p-4">
          <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <Folder className="h-4 w-4" />
            Escaneie notebook/pendrive na tela de Armazenamento para atualizar esta lista.
          </div>
        </section>
      </div>
    </>
  );
}
