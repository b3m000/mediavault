import { Cloud, HardDrive, Play, Save } from "lucide-react";
import { useEffect, useState } from "react";
import {
  authenticateDrive,
  disconnectDrive,
  getApiBaseUrl,
  getDriveStatus,
  getStorageSources,
  scanStorage,
  setApiBaseUrlPreference,
  setDriveFolders,
  setStoragePaths,
  syncDrive,
  type ApiStorageContentPaths,
  type ApiStorageSource,
  type ApiDriveStatus,
} from "../api/client";
import { Header } from "../components/Header";
import { getStorageLabel, getStorageStatusLabel } from "../utils/content";

type LocalStorageType = "notebook" | "pendrive";
type ContentPathKey = keyof ApiStorageContentPaths;

const EMPTY_PATHS: ApiStorageContentPaths = {
  course: "",
  movie: "",
  file: "",
};

const PATH_LABELS: Record<ContentPathKey, string> = {
  course: "Cursos",
  movie: "Filmes",
  file: "Arquivos",
};

const PLAYER_RATE_STORAGE_KEY = "mediavault.player.playbackRate";
const PLAYER_SUBTITLES_STORAGE_KEY = "mediavault.player.preferSubtitles";

function clonePaths(paths?: ApiStorageContentPaths): ApiStorageContentPaths {
  return {
    course: paths?.course ?? "",
    movie: paths?.movie ?? "",
    file: paths?.file ?? "",
  };
}

function getStoredPlaybackRate(): string {
  return window.localStorage.getItem(PLAYER_RATE_STORAGE_KEY) ?? "1";
}

export function Settings() {
  const [sources, setSources] = useState<ApiStorageSource[]>([]);
  const [driveStatus, setDriveStatus] = useState<ApiDriveStatus | null>(null);
  const [paths, setPaths] = useState<Record<LocalStorageType, ApiStorageContentPaths>>({
    notebook: clonePaths(EMPTY_PATHS),
    pendrive: clonePaths(EMPTY_PATHS),
  });
  const [driveFolders, setDriveFoldersState] = useState<ApiStorageContentPaths>(clonePaths(EMPTY_PATHS));
  const [apiUrl, setApiUrl] = useState(() => getApiBaseUrl());
  const [playbackRate, setPlaybackRate] = useState(() => getStoredPlaybackRate());
  const [preferSubtitles, setPreferSubtitles] = useState(
    () => window.localStorage.getItem(PLAYER_SUBTITLES_STORAGE_KEY) === "true",
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function refreshSettings() {
    setLoading(true);
    setFeedback("");

    try {
      const [storageSources, drive] = await Promise.all([getStorageSources(), getDriveStatus()]);
      setSources(storageSources);
      setDriveStatus(drive);
      setDriveFoldersState(clonePaths(drive.folders));

      const notebook = storageSources.find((source) => source.type === "notebook");
      const pendrive = storageSources.find((source) => source.type === "pendrive");

      setPaths({
        notebook: clonePaths(notebook?.contentPaths),
        pendrive: clonePaths(pendrive?.contentPaths),
      });
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Falha ao carregar configurações.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshSettings();
  }, []);

  function updatePath(storageType: LocalStorageType, contentType: ContentPathKey, value: string) {
    setPaths((current) => ({
      ...current,
      [storageType]: {
        ...current[storageType],
        [contentType]: value,
      },
    }));
  }

  function updateDriveFolder(contentType: ContentPathKey, value: string) {
    setDriveFoldersState((current) => ({
      ...current,
      [contentType]: value,
    }));
  }

  async function handleSaveSettings() {
    setBusy(true);
    setFeedback("");

    try {
      await setStoragePaths("notebook", paths.notebook);
      await setStoragePaths("pendrive", paths.pendrive);
      setApiBaseUrlPreference(apiUrl);
      window.localStorage.setItem(PLAYER_RATE_STORAGE_KEY, playbackRate);
      window.localStorage.setItem(PLAYER_SUBTITLES_STORAGE_KEY, String(preferSubtitles));
      await refreshSettings();
      setFeedback("Configurações salvas.");
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Falha ao salvar configurações.");
    } finally {
      setBusy(false);
    }
  }

  async function handleScan(type: LocalStorageType) {
    setBusy(true);
    setFeedback("");

    try {
      await scanStorage(type);
      await refreshSettings();
      setFeedback(`Escaneamento de ${getStorageLabel(type)} concluído.`);
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Falha ao escanear.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAuthenticateDrive() {
    setBusy(true);
    setFeedback("Abrindo autenticação do Google Drive no navegador...");

    try {
      const status = await authenticateDrive();
      setDriveStatus(status);
      setDriveFoldersState(clonePaths(status.folders));
      setFeedback("Google Drive conectado.");
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Falha ao autenticar Google Drive.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveDriveFolders() {
    setBusy(true);
    setFeedback("");

    try {
      const status = await setDriveFolders(driveFolders);
      setDriveStatus(status);
      setDriveFoldersState(clonePaths(status.folders));
      setFeedback("Pastas do Google Drive salvas.");
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Falha ao salvar pastas do Google Drive.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSyncDrive() {
    setBusy(true);
    setFeedback("");

    try {
      const report = await syncDrive();
      await refreshSettings();
      setFeedback(`Google Drive sincronizado: ${report.syncedFiles} arquivo(s).`);
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Falha ao sincronizar Google Drive.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnectDrive() {
    setBusy(true);
    setFeedback("");

    try {
      const status = await disconnectDrive();
      setDriveStatus(status);
      setFeedback("Google Drive desconectado.");
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Falha ao desconectar Google Drive.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Header title="Configurações" subtitle="Caminhos, API local e preferências do player" searchPlaceholder="Buscar opção" />

      <div className="page-body space-y-5">
        <section className="panel p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="brand-font text-xl font-semibold text-[var(--text)]">Caminhos por categoria</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                O scanner usa esses caminhos para decidir se um vídeo é curso, filme ou arquivo geral.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleSaveSettings()}
              disabled={busy}
              className="btn-primary inline-flex items-center justify-center gap-2 px-3 py-2 text-xs disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              Salvar tudo
            </button>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {(["notebook", "pendrive"] as const).map((storageType) => {
              const source = sources.find((item) => item.type === storageType);

              return (
                <article key={storageType} className="rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <HardDrive className="h-4 w-4 text-slate-300" />
                      <h3 className="font-semibold text-[var(--text)]">{getStorageLabel(storageType)}</h3>
                    </div>
                    {source ? <span className="status-pill">{getStorageStatusLabel(source.status)}</span> : null}
                  </div>

                  <div className="mt-4 space-y-3">
                    {(Object.keys(PATH_LABELS) as ContentPathKey[]).map((contentType) => (
                      <label key={contentType} className="block text-sm font-semibold text-[var(--muted)]">
                        {PATH_LABELS[contentType]}
                        <input
                          type="text"
                          value={paths[storageType][contentType]}
                          onChange={(event) => updatePath(storageType, contentType, event.target.value)}
                          className="text-field mt-1"
                          placeholder={storageType === "notebook" ? `C:/MediaVault/${PATH_LABELS[contentType]}` : `E:/MediaVault/${PATH_LABELS[contentType]}`}
                        />
                      </label>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleScan(storageType)}
                    disabled={busy}
                    className="btn-secondary mt-4 px-3 py-2 text-xs disabled:opacity-50"
                  >
                    Escanear {getStorageLabel(storageType)}
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <article className="panel p-4">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-slate-300" />
              <h2 className="brand-font text-lg font-semibold text-[var(--text)]">API local</h2>
            </div>
            <label className="mt-4 block text-sm font-semibold text-[var(--muted)]">
              URL da API
              <input
                type="text"
                value={apiUrl}
                onChange={(event) => setApiUrl(event.target.value)}
                className="text-field mt-1"
                placeholder="http://localhost:8787"
              />
            </label>
          </article>

          <article className="panel p-4">
            <div className="flex items-center gap-2">
              <Play className="h-4 w-4 text-slate-300" />
              <h2 className="brand-font text-lg font-semibold text-[var(--text)]">Player</h2>
            </div>
            <div className="mt-4 grid gap-3">
              <label className="text-sm font-semibold text-[var(--muted)]">
                Velocidade padrão
                <select value={playbackRate} onChange={(event) => setPlaybackRate(event.target.value)} className="select-field mt-1">
                  <option value="0.75">0.75x</option>
                  <option value="1">1x</option>
                  <option value="1.25">1.25x</option>
                  <option value="1.5">1.5x</option>
                  <option value="1.75">1.75x</option>
                  <option value="2">2x</option>
                </select>
              </label>
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={preferSubtitles}
                  onChange={(event) => setPreferSubtitles(event.target.checked)}
                  className="h-4 w-4"
                />
                Preferir legenda automática quando houver .vtt
              </label>
            </div>
          </article>
        </section>

        <section className="panel p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-3 text-sm text-[var(--muted)]">
              <Cloud className="mt-0.5 h-5 w-5 text-slate-300" />
              <div>
                <h2 className="brand-font text-lg font-semibold text-[var(--text)]">Google Drive mestre</h2>
                <p className="mt-1">
                  Use OAuth local e três pastas escolhidas para transformar o Drive no catálogo principal. Notebook e pendrive continuam como cache offline.
                </p>
                <p className="mt-2 text-xs">
                  Credenciais esperadas em: <span className="break-all font-semibold">{driveStatus?.credentialsPath ?? "server/data/google-credentials.json"}</span>
                </p>
              </div>
            </div>
            <span className="status-pill self-start">
              {driveStatus?.connected ? "Conectado" : driveStatus?.credentialsPresent ? "Credenciais prontas" : "Credenciais pendentes"}
            </span>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-3">
            {(Object.keys(PATH_LABELS) as ContentPathKey[]).map((contentType) => (
              <label key={contentType} className="block text-sm font-semibold text-[var(--muted)]">
                Pasta Drive - {PATH_LABELS[contentType]}
                <input
                  type="text"
                  value={driveFolders[contentType]}
                  onChange={(event) => updateDriveFolder(contentType, event.target.value)}
                  className="text-field mt-1"
                  placeholder="ID ou URL da pasta no Google Drive"
                />
              </label>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleAuthenticateDrive()}
              disabled={busy || !driveStatus?.credentialsPresent}
              className="btn-primary px-3 py-2 text-xs disabled:opacity-50"
            >
              Conectar Drive
            </button>
            <button
              type="button"
              onClick={() => void handleSaveDriveFolders()}
              disabled={busy}
              className="btn-secondary px-3 py-2 text-xs disabled:opacity-50"
            >
              Salvar pastas
            </button>
            <button
              type="button"
              onClick={() => void handleSyncDrive()}
              disabled={busy || !driveStatus?.connected}
              className="btn-secondary px-3 py-2 text-xs disabled:opacity-50"
            >
              Sincronizar Drive
            </button>
            <button
              type="button"
              onClick={() => void handleDisconnectDrive()}
              disabled={busy || !driveStatus?.connected}
              className="btn-danger-soft px-3 py-2 text-xs disabled:opacity-50"
            >
              Desconectar
            </button>
          </div>

          <div className="mt-3 text-xs text-[var(--muted)]">
            <p>Escopo OAuth: leitura do Drive. A v1 indexa vídeos, PDFs e ZIPs; Docs, Sheets e Slides ficam fora.</p>
            <p className="mt-1">
              Token local: <span className="break-all font-semibold">{driveStatus?.tokenPath ?? "server/data/google-token.json"}</span>
            </p>
          </div>
        </section>

        {loading ? <p className="panel p-4 text-sm text-[var(--muted)]">Carregando configurações...</p> : null}
        {feedback ? <p className="panel p-4 text-sm text-[var(--muted)]">{feedback}</p> : null}
      </div>
    </>
  );
}
