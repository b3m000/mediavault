import { ChevronLeft } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getPlayerItem, markCompleted, saveProgress, type ApiPlayerItem } from "../api/client";
import { Header } from "../components/Header";
import { ProgressBar } from "../components/ProgressBar";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787";
const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];

function formatRateLabel(value: number): string {
  return `${value.toFixed(2).replace(/\.00$/, "")}x`;
}

export function Player() {
  const navigate = useNavigate();
  const params = useParams();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastProgressSyncRef = useRef(0);

  const mediaItemId = useMemo(() => params.id ?? "", [params.id]);

  const [media, setMedia] = useState<ApiPlayerItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [subtitleTrackIndex, setSubtitleTrackIndex] = useState<number>(-1);
  const [playbackState, setPlaybackState] = useState({
    currentTime: 0,
    duration: 0,
    percentage: 0,
  });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!mediaItemId) {
        setError("ID de mídia inválido.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const payload = await getPlayerItem(mediaItemId);
        if (!isMounted) {
          return;
        }

        setMedia(payload);
        const defaultSubtitleIndex = payload.subtitleTracks.findIndex((track) => track.default);
        setSubtitleTrackIndex(defaultSubtitleIndex >= 0 ? defaultSubtitleIndex : -1);
      } catch (cause) {
        if (isMounted) {
          setError(cause instanceof Error ? cause.message : "Falha ao carregar player real.");
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
  }, [mediaItemId]);

  function applySubtitleSelection(index: number) {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const textTracks = video.textTracks;
    for (let trackIndex = 0; trackIndex < textTracks.length; trackIndex += 1) {
      textTracks[trackIndex].mode = trackIndex === index ? "showing" : "disabled";
    }
  }

  useEffect(() => {
    applySubtitleSelection(subtitleTrackIndex);
  }, [subtitleTrackIndex, media?.id]);

  async function syncProgress(force = false) {
    if (!media || !videoRef.current) {
      return;
    }

    const now = Date.now();
    if (!force && now - lastProgressSyncRef.current < 7000) {
      return;
    }

    lastProgressSyncRef.current = now;
    setSyncing(true);

    try {
      await saveProgress({
        mediaItemId: media.id,
        currentTime: videoRef.current.currentTime,
        duration: videoRef.current.duration || 0,
      });
    } finally {
      setSyncing(false);
    }
  }

  function handleLoadedMetadata() {
    if (!videoRef.current) {
      return;
    }

    const resumeAt = media?.progress?.currentTime ?? 0;
    const duration = videoRef.current.duration || 0;

    if (resumeAt > 0 && resumeAt < duration - 1) {
      videoRef.current.currentTime = resumeAt;
    }

    videoRef.current.playbackRate = playbackRate;
    applySubtitleSelection(subtitleTrackIndex);

    const currentTime = videoRef.current.currentTime;
    const percentage = duration > 0 ? (currentTime / duration) * 100 : 0;
    setPlaybackState({ currentTime, duration, percentage });
  }

  function handleTimeUpdate() {
    if (!videoRef.current) {
      return;
    }

    const currentTime = videoRef.current.currentTime;
    const duration = videoRef.current.duration || 0;
    const percentage = duration > 0 ? (currentTime / duration) * 100 : 0;

    setPlaybackState({ currentTime, duration, percentage });
    void syncProgress(false);
  }

  async function handlePause() {
    await syncProgress(true);
  }

  async function handleEnded() {
    if (!media) {
      return;
    }

    await markCompleted(media.id);
    setPlaybackState((previous) => ({ ...previous, percentage: 100, currentTime: previous.duration }));
  }

  function updatePlaybackRate(nextRate: number) {
    const normalized = PLAYBACK_RATES.includes(nextRate) ? nextRate : 1;
    setPlaybackRate(normalized);
    if (videoRef.current) {
      videoRef.current.playbackRate = normalized;
    }
  }

  function stepPlaybackRate(direction: -1 | 1) {
    const currentRate = videoRef.current?.playbackRate ?? playbackRate;
    const nearestIndex = PLAYBACK_RATES.reduce((bestIndex, candidate, index) => {
      const bestDistance = Math.abs(PLAYBACK_RATES[bestIndex] - currentRate);
      const nextDistance = Math.abs(candidate - currentRate);
      return nextDistance < bestDistance ? index : bestIndex;
    }, 0);

    const nextIndex = Math.max(0, Math.min(PLAYBACK_RATES.length - 1, nearestIndex + direction));
    updatePlaybackRate(PLAYBACK_RATES[nextIndex]);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }

      const video = videoRef.current;
      if (!video) {
        return;
      }

      if (event.key === " " || event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (video.paused) {
          void video.play();
        } else {
          video.pause();
        }
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - 5);
        return;
      }

      if (event.key === "]") {
        event.preventDefault();
        stepPlaybackRate(1);
        return;
      }

      if (event.key === "[") {
        event.preventDefault();
        stepPlaybackRate(-1);
        return;
      }

      if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        video.muted = !video.muted;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [playbackRate]);

  if (loading) {
    return (
      <>
        <Header title="Player" subtitle="Carregando mídia" searchPlaceholder="Buscar" />
        <div className="page-body">
          <p className="panel p-4 text-sm text-[var(--muted)]">Carregando player...</p>
        </div>
      </>
    );
  }

  if (error || !media) {
    return (
      <>
        <Header title="Player" subtitle="Mídia não disponível" searchPlaceholder="Buscar" />
        <div className="page-body">
          <article className="panel p-4 text-sm text-[var(--muted)]">
            <p>{error || "Não foi possível carregar essa mídia."}</p>
            <Link to="/files" className="btn-primary mt-3 inline-block px-3 py-2 text-xs">
              Ir para Arquivos
            </Link>
          </article>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Player Real" subtitle={`Assistindo: ${media.title}`} searchPlaceholder="Buscar mídia" />

      <div className="page-body space-y-5">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary inline-flex items-center gap-2 px-3 py-2 text-xs">
            <ChevronLeft className="h-4 w-4" /> Voltar
          </button>

          <button
            type="button"
            onClick={async () => {
              await markCompleted(media.id);
              setPlaybackState((previous) => ({ ...previous, percentage: 100, currentTime: previous.duration }));
            }}
            className="btn-primary px-3 py-2 text-xs"
          >
            Marcar como concluída
          </button>

          <label className="ml-auto inline-flex items-center gap-2 text-xs font-semibold text-[var(--muted)]">
            Velocidade
            <select
              value={String(playbackRate)}
              onChange={(event) => updatePlaybackRate(Number(event.target.value))}
              className="select-field h-9 w-28"
            >
              {PLAYBACK_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {formatRateLabel(rate)}
                </option>
              ))}
            </select>
          </label>

          <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--muted)]">
            Legenda
            <select
              value={String(subtitleTrackIndex)}
              onChange={(event) => setSubtitleTrackIndex(Number(event.target.value))}
              className="select-field h-9 w-44"
            >
              <option value={-1}>Desativada</option>
              {media.subtitleTracks.map((track, index) => (
                <option key={track.id} value={index}>
                  {track.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <section className="panel p-4">
          <video
            ref={videoRef}
            src={`${API_BASE_URL}${media.streamUrl}`}
            controls
            className="h-auto w-full rounded-xl bg-black"
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onPause={handlePause}
            onEnded={handleEnded}
          >
            {media.subtitleTracks.map((track) => (
              <track
                key={track.id}
                src={`${API_BASE_URL}${track.url}`}
                kind={track.kind}
                srcLang={track.lang}
                label={track.label}
                default={track.default}
              />
            ))}
          </video>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <p className="text-sm text-[var(--muted)]">
              <strong>Título:</strong> {media.title}
            </p>
            <p className="text-sm text-[var(--muted)]">
              <strong>Arquivo:</strong> {media.fileName}
            </p>
            <p className="text-sm text-[var(--muted)]">
              <strong>Sincronização:</strong> {syncing ? "Salvando progresso..." : "Atualizado"}
            </p>
          </div>

          <div className="mt-4 max-w-xl">
            <ProgressBar value={playbackState.percentage} />
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Tempo atual: {Math.floor(playbackState.currentTime)}s / {Math.floor(playbackState.duration)}s
          </p>

          <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] p-3 text-xs text-[var(--muted)]">
            Atalhos: <strong>K</strong> ou <strong>Espaço</strong> play/pause, <strong>←/→</strong> pula 5s, <strong>[</strong> e <strong>]</strong> ajustam velocidade, <strong>M</strong> alterna mudo.
          </div>
        </section>
      </div>
    </>
  );
}
