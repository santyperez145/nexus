"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

type Tab = "image" | "speech" | "transcribe" | "video" | "embeddings";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "image", label: "Imagen" },
  { id: "speech", label: "TTS" },
  { id: "transcribe", label: "STT" },
  { id: "video", label: "Video" },
  { id: "embeddings", label: "Embeddings" },
];

export function MediaStudio() {
  const [tab, setTab] = useState<Tab>("image");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("Amber mesh over a dark terminal — Nexus gateway");
  const [tts, setTts] = useState("Nexus: una API, todos los labs.");
  const [embed, setEmbed] = useState("gateway de modelos OpenAI-compatible");
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

  async function runImage() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, n: 1 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Error imagen");
      const url = json.data?.[0]?.url ?? (json.data?.[0]?.b64_json ? `data:image/svg+xml;base64,${json.data[0].b64_json}` : null);
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
        body: JSON.stringify({ input: tts }),
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
      fd.append("model", "whisper-1");
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
      if (json.status === "processing") {
        const poll = await fetch(`/api/v1/videos?id=${json.id}`);
        const p = await poll.json();
        if (p.data) setVideoJob({ id: p.data.id, status: p.data.status, resultUrl: p.data.resultUrl });
      }
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
        body: JSON.stringify({ input: embed, model: "openai/text-embedding-3-small" }),
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

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              tab === t.id ? "bg-amber-400/15 text-amber-200" : "text-zinc-500 hover:text-zinc-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-400/30 bg-rose-400/5 px-3 py-2 text-sm text-rose-200">{error}</p>
      ) : null}

      {tab === "image" ? (
        <Panel
          title="Images"
          hint="POST /api/v1/images/generations — placeholder SVG local sin OPENAI key."
          onRun={() => void runImage()}
          busy={busy}
        >
          <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} />
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="Nexus studio" className="mt-4 max-h-80 rounded-xl border border-white/10" />
          ) : null}
        </Panel>
      ) : null}

      {tab === "speech" ? (
        <Panel
          title="Text to speech"
          hint="POST /api/v1/audio/speech — WAV local sin key de lab."
          onRun={() => void runSpeech()}
          busy={busy}
        >
          <Textarea value={tts} onChange={(e) => setTts(e.target.value)} rows={3} />
          {audioUrl ? <audio className="mt-4 w-full" controls src={audioUrl} /> : null}
        </Panel>
      ) : null}

      {tab === "transcribe" ? (
        <Panel title="Speech to text" hint="POST /api/v1/audio/transcriptions (multipart)." busy={busy}>
          <Input
            type="file"
            accept="audio/*,video/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void runTranscribe(f);
            }}
          />
          {transcript ? (
            <pre className="mt-4 whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-zinc-300">
              {transcript}
            </pre>
          ) : null}
        </Panel>
      ) : null}

      {tab === "video" ? (
        <Panel
          title="Video jobs"
          hint="POST /api/v1/videos + poll — local completed sin Fal/Replicate."
          onRun={() => void runVideo()}
          busy={busy}
        >
          <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} />
          {videoJob ? (
            <div className="mt-4 rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-400">
              <div className="font-mono text-amber-400/80">{videoJob.id}</div>
              <div className="mt-1">status: {videoJob.status}</div>
              {videoJob.resultUrl ? (
                <a href={videoJob.resultUrl} className="mt-1 block text-amber-400 hover:underline" target="_blank" rel="noreferrer">
                  result
                </a>
              ) : null}
            </div>
          ) : null}
        </Panel>
      ) : null}

      {tab === "embeddings" ? (
        <Panel
          title="Embeddings"
          hint="POST /api/v1/embeddings — vector local 256-d sin OpenAI key."
          onRun={() => void runEmbed()}
          busy={busy}
        >
          <Textarea value={embed} onChange={(e) => setEmbed(e.target.value)} rows={3} />
          {embedPreview ? (
            <div className="mt-4 rounded-xl border border-white/10 px-3 py-2 font-mono text-xs text-zinc-400">
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
          <Link href={`/activity/${genId}`} className="font-mono text-amber-400/80 hover:underline">
            {genId}
          </Link>{" "}
          · queda en Activity / Analytics
        </p>
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
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold text-zinc-100">{title}</h2>
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
