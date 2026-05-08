import { useEffect, useMemo, useState } from "react";
import { getLibrary, type ApiMediaItem } from "../api/client";
import { ContentCard } from "../components/ContentCard";
import { Header } from "../components/Header";
import { toMediaContent } from "../utils/api-mappers";
import { sortByProgressDesc } from "../utils/content";

export function Courses() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<"progress" | "title">("progress");
  const [items, setItems] = useState<ApiMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const data = await getLibrary({ type: "course" });
        if (!isMounted) {
          return;
        }

        setItems(data);
      } catch (cause) {
        if (isMounted) {
          setError(cause instanceof Error ? cause.message : "Falha ao carregar cursos.");
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
  }, []);

  const categories = useMemo(() => {
    const values = new Set(items.map((item) => item.category));
    return ["all", ...Array.from(values)];
  }, [items]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    const result = items.filter((item) => {
      const matchesCategory = category === "all" || item.category === category;
      const matchesSearch = !term || item.title.toLowerCase().includes(term) || item.fileName.toLowerCase().includes(term);
      return matchesCategory && matchesSearch;
    });

    const mapped = result.map(toMediaContent);

    if (sort === "progress") {
      return sortByProgressDesc(mapped);
    }

    return [...mapped].sort((a, b) => a.title.localeCompare(b.title));
  }, [items, search, category, sort]);

  return (
    <>
      <Header
        title="Cursos"
        subtitle="Coleções de aulas e trilhas de estudo"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar curso"
      />

      <div className="page-body space-y-4">
        <section className="panel p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <label className="text-sm font-semibold text-[var(--muted)]">
              Categoria
              <select value={category} onChange={(event) => setCategory(event.target.value)} className="select-field mt-1">
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item === "all" ? "Todas" : item}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-semibold text-[var(--muted)]">
              Ordenação
              <select value={sort} onChange={(event) => setSort(event.target.value as "progress" | "title")} className="select-field mt-1">
                <option value="progress">Maior progresso</option>
                <option value="title">Título (A-Z)</option>
              </select>
            </label>

            <p className="text-xs text-[var(--muted)] md:ml-auto">{filtered.length} curso(s)</p>
          </div>
        </section>

        {loading ? <p className="panel p-4 text-sm text-[var(--muted)]">Carregando cursos...</p> : null}
        {error ? <p className="panel p-4 text-sm text-rose-300">{error}</p> : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((content) => (
            <ContentCard key={content.id} content={content} />
          ))}
        </section>

        {!loading && !error && !filtered.length ? (
          <p className="panel p-4 text-sm text-[var(--muted)]">Nenhum curso encontrado para os filtros atuais.</p>
        ) : null}
      </div>
    </>
  );
}
