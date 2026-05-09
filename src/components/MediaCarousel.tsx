import { ChevronLeft, ChevronRight, Info, PlayCircle } from "lucide-react";
import { useRef } from "react";
import { Link } from "react-router-dom";
import type { ApiMediaItem } from "../api/client";
import { canOpenPlayerForMedia, formatPercentage, getStorageLabel, getTypeLabel, isOnlinePlayerMedia } from "../utils/content";

interface MediaCarouselProps {
  title: string;
  subtitle?: string;
  items: ApiMediaItem[];
  emptyMessage?: string;
}

export function MediaCarousel({ title, subtitle, items, emptyMessage = "Nenhum item encontrado." }: MediaCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  function scrollByCard(direction: -1 | 1) {
    scrollerRef.current?.scrollBy({
      left: direction * 320,
      behavior: "smooth",
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="brand-font text-xl font-semibold text-slate-100">{title}</h3>
          {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => scrollByCard(-1)}
            className="btn-secondary inline-flex h-9 w-9 items-center justify-center"
            aria-label={`Voltar ${title}`}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollByCard(1)}
            className="btn-secondary inline-flex h-9 w-9 items-center justify-center"
            aria-label={`Avançar ${title}`}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {items.length ? (
        <div ref={scrollerRef} className="flex snap-x gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]">
          {items.map((item) => {
            const canPlay = canOpenPlayerForMedia(item);
            const isOnlinePlayback = isOnlinePlayerMedia(item);
            const metadata = item.genre || item.collection || item.category;

            return (
              <article key={item.id} className="home-media-card min-w-[245px] snap-start sm:min-w-[285px]">
                <img src={item.thumbnail} alt={item.title} className="h-full w-full object-cover" loading="lazy" />
                <div className="home-media-overlay">
                  <div className="flex flex-wrap gap-2">
                    <span className="home-tag">{getTypeLabel(item.contentType)}</span>
                    <span className="home-tag">{getStorageLabel(item.localStorageType ?? item.storageType)}</span>
                  </div>
                  <h4 className="mt-2 line-clamp-2 text-base font-semibold text-slate-100">{item.title}</h4>
                  <p className="mt-1 truncate text-xs text-slate-300">{metadata || item.fileName}</p>
                  {item.progress.percentage > 0 ? (
                    <>
                      <div className="mt-3 home-progress-track">
                        <div className="home-progress-fill" style={{ width: `${item.progress.percentage}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-slate-300">{formatPercentage(item.progress.percentage)}</p>
                    </>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Link to={`/content/${item.id}`} className="home-action inline-flex items-center gap-1 px-3 py-1.5 text-xs">
                      <Info className="h-3.5 w-3.5" />
                      Detalhes
                    </Link>
                    {canPlay ? (
                      <Link to={`/player/local/${item.id}`} className="home-action inline-flex items-center gap-1 px-3 py-1.5 text-xs">
                        <PlayCircle className="h-3.5 w-3.5" />
                        {isOnlinePlayback ? "Online" : "Assistir"}
                      </Link>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="home-block p-4 text-sm text-slate-300">{emptyMessage}</p>
      )}
    </section>
  );
}
