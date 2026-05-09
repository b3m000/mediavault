import { Layers3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getLibrary, type ApiMediaItem } from "../api/client";
import { ContentCard } from "../components/ContentCard";
import { Header } from "../components/Header";
import { LibraryFilters } from "../components/LibraryFilters";
import { toMediaContent } from "../utils/api-mappers";
import { clearFiltersWithType, matchesLibraryFilters, type LibraryFilterState } from "../utils/library-filters";

type MovieSort = "title" | "genre" | "collection" | "date";
type MovieView = "grid" | "collections";

function sortMovies(items: ApiMediaItem[], sort: MovieSort): ApiMediaItem[] {
  return [...items].sort((a, b) => {
    if (sort === "genre") {
      return (a.genre || a.category || "zz").localeCompare(b.genre || b.category || "zz") || a.title.localeCompare(b.title);
    }

    if (sort === "collection") {
      return (a.collection || "zz").localeCompare(b.collection || "zz") || (a.collectionOrder ?? 9999) - (b.collectionOrder ?? 9999);
    }

    if (sort === "date") {
      const dateA = a.releaseDate || (a.year ? `${a.year}-01-01` : a.createdAt);
      const dateB = b.releaseDate || (b.year ? `${b.year}-01-01` : b.createdAt);
      return dateB.localeCompare(dateA) || a.title.localeCompare(b.title);
    }

    return a.title.localeCompare(b.title);
  });
}

function groupByCollection(items: ApiMediaItem[]): Array<{ name: string; items: ApiMediaItem[] }> {
  const groups = new Map<string, ApiMediaItem[]>();

  for (const item of items) {
    const key = item.collection || "Sem coleção";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return Array.from(groups.entries())
    .map(([name, groupItems]) => ({
      name,
      items: sortMovies(groupItems, "collection"),
    }))
    .sort((a, b) => (a.name === "Sem coleção" ? 1 : b.name === "Sem coleção" ? -1 : a.name.localeCompare(b.name)));
}

export function Movies() {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<MovieSort>("title");
  const [view, setView] = useState<MovieView>("grid");
  const [filters, setFilters] = useState<LibraryFilterState>(clearFiltersWithType("movie"));
  const [items, setItems] = useState<ApiMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const data = await getLibrary({ type: "movie" });
        if (!isMounted) {
          return;
        }

        setItems(data);
      } catch (cause) {
        if (isMounted) {
          setError(cause instanceof Error ? cause.message : "Falha ao carregar filmes.");
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

  const filtered = useMemo(
    () => sortMovies(items.filter((item) => matchesLibraryFilters(item, filters, search)), sort),
    [items, search, filters, sort],
  );

  const grouped = useMemo(() => groupByCollection(filtered), [filtered]);

  function handleRemoved(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  return (
    <>
      <Header
        title="Filmes"
        subtitle="Biblioteca visual com capas, gêneros, trilogias, coleções e status offline"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar filme, arquivo, gênero ou coleção"
      />

      <div className="page-body space-y-4">
        <LibraryFilters
          filters={filters}
          onChange={(next) => setFilters({ ...next, type: "movie" })}
          onClear={() => setFilters(clearFiltersWithType("movie"))}
          resultCount={filtered.length}
          typeOptions={[{ value: "movie", label: "Todos os filmes" }]}
        />

        <section className="panel p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <label className="text-sm font-semibold text-[var(--muted)]">
              Ordenar
              <select value={sort} onChange={(event) => setSort(event.target.value as MovieSort)} className="select-field mt-1">
                <option value="title">Nome</option>
                <option value="genre">Gênero</option>
                <option value="collection">Coleção/Trilogia</option>
                <option value="date">Data</option>
              </select>
            </label>

            <label className="text-sm font-semibold text-[var(--muted)]">
              Visualização
              <select value={view} onChange={(event) => setView(event.target.value as MovieView)} className="select-field mt-1">
                <option value="grid">Cards</option>
                <option value="collections">Agrupar por coleção</option>
              </select>
            </label>

            <div className="text-xs text-[var(--muted)] md:ml-auto">
              <p>{items.filter((item) => !item.hasCover).length} sem capa</p>
              <p>{items.filter((item) => !item.genre).length} sem gênero</p>
              <p>{items.filter((item) => !item.collection).length} sem coleção</p>
            </div>
          </div>
        </section>

        {loading ? <p className="panel p-4 text-sm text-[var(--muted)]">Carregando filmes...</p> : null}
        {error ? <p className="panel p-4 text-sm text-rose-300">{error}</p> : null}

        {view === "collections" ? (
          <section className="space-y-5">
            {grouped.map((group) => (
              <div key={group.name}>
                <div className="mb-3 flex items-center gap-2">
                  <Layers3 className="h-5 w-5 text-slate-300" />
                  <h2 className="brand-font text-xl font-semibold text-[var(--text)]">{group.name}</h2>
                  <span className="status-pill">{group.items.length} filme(s)</span>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {group.items.map((content) => (
                    <ContentCard key={content.id} content={toMediaContent(content)} onRemoved={handleRemoved} enableRemoveAction />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ) : (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((content) => (
              <ContentCard key={content.id} content={toMediaContent(content)} onRemoved={handleRemoved} enableRemoveAction />
            ))}
          </section>
        )}

        {!loading && !error && !filtered.length ? (
          <p className="panel p-4 text-sm text-[var(--muted)]">Nenhum filme encontrado para os filtros atuais.</p>
        ) : null}
      </div>
    </>
  );
}
