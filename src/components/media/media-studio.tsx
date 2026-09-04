"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useRemoteData } from "@/lib/use-remote-data";

type Tab = "image" | "speech" | "transcribe" | "video" | "embeddings";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "image", label: "Imagen" },
  { id: "speech", label: "Voz" },
  { id: "transcribe", label: "Transcribir" },
  { id: "video", label: "Video" },
  { id: "embeddings", label: "Vectores" },
];

const IMAGE_MODELS = [
  "openai/gpt-image-2",
  "openai/gpt-image-1.5",
  "openai/gpt-image-1",
  "openai/gpt-image-1-mini",
];
const TTS_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "marin",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
  "cedar",
];
const EMBED_MODELS = [
  "openai/text-embedding-3-small",
  "openai/text-embedding-3-large",
];
const TTS_MODELS = ["openai/gpt-4o-mini-tts", "openai/tts-1", "openai/tts-1-hd"];
const STT_MODELS = [
  "openai/gpt-transcribe",
  "openai/gpt-4o-transcribe",
  "openai/gpt-4o-mini-transcribe",
  "openai/whisper-1",
];

type Recent = {
  id: string;
  model: string;
  provider: string;
  tokens: number;
};

export function MediaStudio({
  initialTab = "image",
  initialModel,
}: {
  initialTab?: Tab;
  initialModel?: string;
}) {
  const requestedModel = initialModel?.startsWith("openai/") ? initialModel : undefined;
  const [tab, setTab] = useState<Tab>(initialTab);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("Amber mesh over a dark terminal — Nexus gateway");
  const [imageModel, setImageModel] = useState(
    requestedModel && IMAGE_MODELS.includes(requestedModel) ? requestedModel : IMAGE_MODELS[0],
  );
  const [imageSize, setImageSize] = useState("1024x1024");
  const [imageQuality, setImageQuality] = useState("medium");
  const [tts, setTts] = useState("Nexus: una API, todos los labs.");
  const [voice, setVoice] = useState("alloy");
  const [ttsModel, setTtsModel] = useState(
    requestedModel && TTS_MODELS.includes(requestedModel) ? requestedModel : TTS_MODELS[0],
  );
  const [speechFormat, setSpeechFormat] = useState("mp3");
  const [sttModel, setSttModel] = useState(
    requestedModel && STT_MODELS.includes(requestedModel) ? requestedModel : STT_MODELS[0],
  );
  const [embed, setEmbed] = useState("gateway de modelos OpenAI-compatible");
  const [embedModel, setEmbedModel] = useState(
    requestedModel && EMBED_MODELS.includes(requestedModel) ? requestedModel : EMBED_MODELS[0],
  );
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [videoJob, setVideoJob] = useState<{ id: string; status: string; resultUrl?: string | null } | null>(
    null,
  );
  const [embedPreview, setEmbedPreview] = useState<{ dims: number; sample: number[]; id?: string } | null>(
    null,
  );
  const [genId, setGenId] = useState<string | null>(null);
  const [analytics, , analyticsError] = useRemoteData<{ recent?: Recent[]; totals?: { local_pct?: number } }>(
    "/api/v1/analytics?days=7",
  );

  useEffect(() => {
    if (!videoJob?.id || videoJob.status === "completed" || videoJob.status === "failed") return;
    let cancelled = false;
    const tick = async () => {
      const poll = await fetch(`/api/v1/videos?id=${videoJob.id}`);
      const p = await poll.json();
      if (cancelled || !p.data) return;
      setVideoJob({ id: p.data.id, status: p.data.status, resultUrl: p.data.resultUrl });
    };
    const id = window.setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [videoJob?.id, videoJob?.status]);

  async function runImage() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          n: 1,
          model: imageModel,
          size: imageSize,
          quality: imageQuality,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Error imagen");
      const url =
        json.data?.[0]?.url ??
        (json.data?.[0]?.b64_json ? `data:image/png;base64,${json.data[0].b64_json}` : null);
      setImageUrl(url);
      setGenId(json.id ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runSpeech() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/audio/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: tts,
          voice,
          model: ttsModel,
          response_format: speechFormat,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error?.message ?? "Error TTS");
      }
      const blob = await res.blob();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(blob));
      setGenId(res.headers.get("x-request-id"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runTranscribe(file: File) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("model", sttModel);
      const res = await fetch("/api/v1/audio/transcriptions", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Error STT");
      setTranscript(json.text ?? "");
      setGenId(json.id ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runVideo() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Error video");
      setVideoJob({ id: json.id, status: json.status, resultUrl: null });
      setGenId(json.generation_id ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runEmbed() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: embed, model: embedModel }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Error embeddings");
      const vec = json.data?.[0]?.embedding ?? [];
      setEmbedPreview({ dims: vec.length, sample: vec.slice(0, 8), id: json.id });
      setGenId(json.id ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const localPct = Math.round((analytics?.totals?.local_pct ?? 0) * 100);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1 rounded-xl border border-zinc-200 bg-white p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                tab === t.id ? "bg-violet-50 text-zinc-700" : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-zinc-500">
          Llamadas de prueba en 7 días: {localPct}% · nunca se simulan resultados
        </span>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}

      {tab === "image" ? (
        <Panel
          title="Generar imagen"
          hint="Elegí el modelo, formato y calidad. El precio se calcula antes de reservar saldo."
          onRun={() => void runImage()}
          busy={busy}
        >
          <div className="mb-3 grid gap-2 sm:grid-cols-3">
            <select
              value={imageModel}
              onChange={(e) => setImageModel(e.target.value)}
              className="h-9 rounded-md border border-zinc-200 bg-zinc-50 px-2 text-sm"
              aria-label="Modelo imagen"
            >
              {IMAGE_MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={imageSize}
              onChange={(e) => setImageSize(e.target.value)}
              className="h-9 rounded-md border border-zinc-200 bg-zinc-50 px-2 text-sm"
              aria-label="Tamaño"
            >
              {["1024x1024", "1536x1024", "1024x1536"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={imageQuality}
              onChange={(e) => setImageQuality(e.target.value)}
              className="h-9 rounded-md border border-zinc-200 bg-zinc-50 px-2 text-sm"
              aria-label="Calidad"
            >
              <option value="low">Rápida</option>
              <option value="medium">Equilibrada</option>
              <option value="high">Máxima</option>
            </select>
          </div>
          <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} />
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="Nexus studio" className="mt-4 max-h-80 rounded-xl border border-zinc-200" />
          ) : null}
        </Panel>
      ) : null}

      {tab === "speech" ? (
        <Panel
          title="Texto a voz"
          hint="Voz real del proveedor, cobrada por caracteres y registrada en tu actividad."
          onRun={() => void runSpeech()}
          busy={busy}
        >
          <div className="mb-3 grid gap-2 sm:grid-cols-3">
            <select
              value={ttsModel}
              onChange={(e) => setTtsModel(e.target.value)}
              className="h-9 rounded-md border border-zinc-200 bg-zinc-50 px-2 text-sm"
              aria-label="Modelo TTS"
            >
              {TTS_MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              className="h-9 rounded-md border border-zinc-200 bg-zinc-50 px-2 text-sm"
              aria-label="Voz"
            >
              {TTS_VOICES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <select
              value={speechFormat}
              onChange={(e) => setSpeechFormat(e.target.value)}
              className="h-9 rounded-md border border-zinc-200 bg-zinc-50 px-2 text-sm"
              aria-label="Formato de audio"
            >
              {["mp3", "wav", "opus", "aac", "flac"].map((format) => (
                <option key={format} value={format}>
                  {format.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <Textarea maxLength={4096} value={tts} onChange={(e) => setTts(e.target.value)} rows={3} />
          <p className="mt-1 text-right text-[11px] text-zinc-400">{tts.length.toLocaleString()} / 4.096</p>
          {audioUrl ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <audio className="w-full max-w-md" controls src={audioUrl} />
              <a
                href={audioUrl}
                download={`nexus-voz.${speechFormat}`}
                className="text-sm text-violet-700 hover:underline"
              >
                Descargar
              </a>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {tab === "transcribe" ? (
        <Panel
          title="Audio a texto"
          hint="La duración se verifica antes de reservar saldo; admite archivos de hasta 25 MiB."
          busy={busy}
        >
          <select
            value={sttModel}
            onChange={(e) => setSttModel(e.target.value)}
            className="mb-3 h-9 w-full max-w-md rounded-md border border-zinc-200 bg-zinc-50 px-2 text-sm"
            aria-label="Modelo STT"
          >
            {STT_MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <Input
            type="file"
            accept="audio/*,video/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void runTranscribe(f);
            }}
          />
          {transcript ? (
            <div className="mt-4">
              <pre className="whitespace-pre-wrap rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
                {transcript}
              </pre>
              <button
                type="button"
                className="mt-2 text-xs text-violet-700 hover:underline"
                onClick={() => void navigator.clipboard.writeText(transcript)}
              >
                Copiar transcripción
              </button>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {tab === "video" ? (
        <Panel
          title="Generar video"
          hint="Crea el trabajo con tu proveedor y actualiza el resultado automáticamente."
          onRun={() => void runVideo()}
          busy={busy}
        >
          <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} />
          {videoJob ? (
            <div className="mt-4 rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-400">
              <div className="font-mono text-violet-700">{videoJob.id}</div>
              <div className="mt-1">Estado: {videoJob.status}</div>
              {videoJob.resultUrl ? (
                <a
                  href={videoJob.resultUrl}
                  className="mt-1 block text-violet-700 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir resultado
                </a>
              ) : null}
            </div>
          ) : null}
        </Panel>
      ) : null}

      {tab === "embeddings" ? (
        <Panel
          title="Vectores semánticos"
          hint="Convierte texto en vectores reales del proveedor para búsqueda y recuperación."
          onRun={() => void runEmbed()}
          busy={busy}
        >
          <select
            value={embedModel}
            onChange={(e) => setEmbedModel(e.target.value)}
            className="mb-3 h-9 w-full max-w-md rounded-md border border-zinc-200 bg-zinc-50 px-2 text-sm"
            aria-label="Modelo embeddings"
          >
            {EMBED_MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <Textarea value={embed} onChange={(e) => setEmbed(e.target.value)} rows={3} />
          {embedPreview ? (
            <div className="mt-4 rounded-xl border border-zinc-200 px-3 py-2 font-mono text-xs text-zinc-400">
              <div>
                dims={embedPreview.dims} · sample=[{embedPreview.sample.map((n) => n.toFixed(3)).join(", ")}…]
              </div>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {genId ? (
        <p className="text-xs text-zinc-600">
          Generación{" "}
          <Link href={`/activity/${genId}`} className="font-mono text-violet-700 hover:underline">
            {genId}
          </Link>{" "}
          · queda en Activity / Analytics
        </p>
      ) : null}

      {analyticsError ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          No se pudo cargar la actividad reciente: {analyticsError}
        </p>
      ) : null}

      {analytics?.recent?.length ? (
        <section className="rounded-2xl border border-zinc-200 p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-zinc-600">Reciente (7d)</h2>
            <Link href="/activity" className="text-xs text-violet-700 hover:underline">
              Activity →
            </Link>
          </div>
          <ul className="space-y-1">
            {analytics.recent.slice(0, 6).map((r) => (
              <li key={r.id}>
                <Link
                  href={`/activity/${r.id}`}
                  className="flex justify-between gap-2 font-mono text-[11px] text-zinc-500 hover:text-zinc-950"
                >
                  <span className="truncate">{r.model}</span>
                  <span>
                    {r.provider} · {r.tokens} tok
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Panel({
  title,
  hint,
  children,
  onRun,
  busy,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
  onRun?: () => void;
  busy?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
          <p className="mt-1 text-xs text-zinc-500">{hint}</p>
        </div>
        {onRun ? (
          <Button size="sm" disabled={busy} onClick={onRun}>
            {busy ? "Generando…" : "Generar"}
          </Button>
        ) : null}
      </div>
      {children}
    </section>
  );
}
