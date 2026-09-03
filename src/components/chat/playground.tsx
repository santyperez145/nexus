"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatUsd } from "@/lib/money";
import { useRemoteData } from "@/lib/use-remote-data";

type Msg = { role: "user" | "assistant" | "system"; content: string };
type Stats = {
  id: string;
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  cost?: number;
};
type FileRow = { id: string; filename: string; bytes: number };
type PresetRow = { id: string; slug: string };

export function Playground({
  models,
  defaultModel = "nexus/auto",
}: {
  models: { id: string; name: string }[];
  defaultModel?: string;
}) {
  const [model, setModel] = useState(defaultModel);
  const [query, setQuery] = useState("");
  const [input, setInput] = useState("");
  const [system, setSystem] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [online, setOnline] = useState(false);
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const files = useRemoteData<FileRow[]>("/api/v1/files")[0] ?? [];
  const presets = useRemoteData<PresetRow[]>("/api/v1/presets")[0] ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? models.filter((m) => `${m.id} ${m.name}`.toLowerCase().includes(q))
      : models;
    return list.slice(0, 40);
  }, [models, query]);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const slug = online && !model.startsWith("@") && !model.includes(":online") ? `${model}:online` : model;

  function stop() {
    abortRef.current?.abort();
    setBusy(false);
  }

  async function send() {
    if (!input.trim() || busy) return;
    const next: Msg[] = [
      ...(system ? [{ role: "system" as const, content: system }] : []),
      ...messages.filter((m) => m.role !== "system"),
      { role: "user", content: input },
    ];
    setMessages(next.filter((m) => m.role !== "system"));
    setInput("");
    setBusy(true);
    setStats(null);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "HTTP-Referer": origin,
          "X-Title": "Nexus Playground",
        },
        signal: ac.signal,
        body: JSON.stringify({
          model: slug,
          messages: next,
          stream: true,
          temperature,
          stream_options: { include_usage: true },
          ...(online ? { tools: [{ type: "nexus:web_search" }] } : {}),
          ...(fileIds.length ? { file_ids: fileIds } : {}),
        }),
      });
      const visible = next.filter((m) => m.role !== "system");
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
        setMessages([...visible, { role: "assistant", content: err.error?.message ?? "Error de gateway" }]);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistant = "";
      let meta: Stats = {
        id: res.headers.get("x-request-id") ?? "",
        provider: "",
        model: slug,
      };
      setMessages([...visible, { role: "assistant", content: "" }]);
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.replace(/^data: /, "");
          if (line === "[DONE]") continue;
          try {
            const json = JSON.parse(line) as {
              id?: string;
              provider?: string;
              model?: string;
              usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
              choices?: Array<{ delta?: { content?: string } }>;
            };
            if (json.id) meta = { ...meta, id: json.id };
            if (json.provider) meta = { ...meta, provider: json.provider };
            if (json.model) meta = { ...meta, model: json.model };
            if (json.usage) {
              meta = {
                ...meta,
                promptTokens: json.usage.prompt_tokens,
                completionTokens: json.usage.completion_tokens,
                cost: json.usage.cost,
              };
            }
            assistant += json.choices?.[0]?.delta?.content ?? "";
            setMessages([...visible, { role: "assistant", content: assistant }]);
          } catch {
            /* ignore */
          }
        }
      }
      setStats(meta);
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setMessages((m) => [...m, { role: "assistant", content: "Error de red" }]);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3">
        <input
          value={query || model}
          onChange={(e) => {
            setQuery(e.target.value);
            setModel(e.target.value);
          }}
          placeholder="Buscar modelo (425 slugs)…"
          className="h-9 rounded-md border border-white/10 bg-transparent px-3 font-mono text-sm"
          aria-label="Modelo"
        />
        <div className="flex max-h-36 flex-wrap gap-1 overflow-y-auto">
          {filtered.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setModel(m.id);
                setQuery("");
              }}
              className={`rounded-md border px-2 py-1 font-mono text-[11px] ${
                model === m.id ? "border-amber-400/60 text-amber-300" : "border-white/10 text-zinc-500"
              }`}
            >
              {m.id}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-400">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} />
            :online
          </label>
          <label className="flex items-center gap-2">
            temp
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              aria-label="Temperature"
            />
            <span className="w-8 font-mono text-xs">{temperature.toFixed(1)}</span>
          </label>
        </div>
      </div>
      {presets.length ? (
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setModel(`@${p.slug}`);
                setQuery("");
              }}
              className={`rounded-md border px-2 py-1 font-mono text-[11px] ${
                model === `@${p.slug}` ? "border-amber-400/60 text-amber-300" : "border-white/10 text-zinc-500"
              }`}
            >
              @{p.slug}
            </button>
          ))}
        </div>
      ) : null}
      {files.length ? (
        <div className="flex flex-wrap gap-2 text-xs text-zinc-400">
          {files.map((f) => {
            const on = fileIds.includes(f.id);
            return (
              <label key={f.id} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    setFileIds((ids) => (on ? ids.filter((id) => id !== f.id) : [...ids, f.id]))
                  }
                />
                {f.filename}
              </label>
            );
          })}
        </div>
      ) : null}
      <Textarea
        value={system}
        onChange={(e) => setSystem(e.target.value)}
        placeholder="System prompt (opcional)"
        className="min-h-16"
      />
      <div className="min-h-[360px] space-y-3 rounded-xl border border-white/10 bg-black/30 p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Chat con tu sesión. Key <code>sk-nx-</code> para apps. Activá <code>:online</code> o adjuntá
            files de Settings.
          </p>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-amber-100" : "text-zinc-200"}>
              <div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">{m.role}</div>
              <div className="whitespace-pre-wrap text-sm">{m.content}</div>
            </div>
          ))
        )}
      </div>
      {stats ? (
        <p className="font-mono text-xs text-zinc-500">
          {stats.id ? (
            <Link href={`/activity/${stats.id}`} className="text-amber-400 hover:underline">
              {stats.id}
            </Link>
          ) : null}
          {stats.provider ? ` · ${stats.provider}` : ""}
          {stats.promptTokens != null ? ` · ${stats.promptTokens}+${stats.completionTokens ?? 0} tok` : ""}
          {stats.cost != null ? ` · ${formatUsd(stats.cost)}` : ""}
        </p>
      ) : null}
      <div className="grid gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe un prompt…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="flex gap-2">
          <Button onClick={() => void send()} disabled={busy}>
            {busy ? "Generando…" : "Enviar"}
          </Button>
          {busy ? (
            <Button variant="outline" onClick={stop}>
              Stop
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
