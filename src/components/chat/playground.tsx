"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatUsd } from "@/lib/money";
import { useRemoteData } from "@/lib/use-remote-data";
import {
  deleteChatSession,
  newSessionId,
  upsertChatSession,
  useChatSessions,
} from "@/components/chat/chat-sessions";

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
type Lane = { model: string; query: string; messages: Msg[]; stats: Stats | null };
type RouteHop = { model: string; adapter: string; wired: boolean; zdr: boolean };
type RoutePreview = { requested: string; mode: string; hops: RouteHop[]; note: string };
type ApiEnvelope = "chat" | "messages" | "responses";

const STARTERS = [
  "Compará 9.9 y 9.11: cuál es más grande y por qué un modelo se confunde.",
  "Review de PR: explicá este enfoque como si fuera un comentario en GitHub.",
  "Armá un agente que llame a Nexus con fallbacks :cheap y :fast.",
];

function applyOnline(model: string, online: boolean) {
  if (!online || model.startsWith("@") || model.includes(":online")) return model;
  return `${model}:online`;
}

export function Playground({
  models,
  defaultModel = "nexus/auto",
  compareModel,
  platformLabs = 0,
  hasByok = false,
  guest = false,
}: {
  models: { id: string; name: string }[];
  defaultModel?: string;
  compareModel?: string;
  platformLabs?: number;
  hasByok?: boolean;
  guest?: boolean;
}) {
  const [lanes, setLanes] = useState<Lane[]>(() => {
    const first: Lane = { model: defaultModel, query: "", messages: [], stats: null };
    if (compareModel && compareModel !== defaultModel) {
      return [first, { model: compareModel, query: "", messages: [], stats: null }];
    }
    return [first];
  });
  const [input, setInput] = useState("");
  const [system, setSystem] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [online, setOnline] = useState(false);
  const [jsonMode, setJsonMode] = useState(false);
  const [envelope, setEnvelope] = useState<ApiEnvelope>("chat");
  const [sort, setSort] = useState<"default" | "price" | "throughput" | "latency">("default");
  const [allowFallbacks, setAllowFallbacks] = useState(true);
  const [zdrOnly, setZdrOnly] = useState(false);
  const [onlyRaw, setOnlyRaw] = useState("");
  const [ignoreRaw, setIgnoreRaw] = useState("");
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [route, setRoute] = useState<RoutePreview | null>(null);
  const [sessionId, setSessionId] = useState(() => newSessionId());
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const sessions = useChatSessions();
  const [filesData, reloadFiles] = useRemoteData<FileRow[]>("/api/v1/files");
  const files = filesData ?? [];
  const presets = useRemoteData<PresetRow[]>("/api/v1/presets")[0] ?? [];
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const echoRisk = platformLabs === 0 && !hasByok;
  const sawLocal = lanes.some((l) => l.stats?.provider === "local");

  function parseCsv(raw: string) {
    return raw
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function providerPrefs() {
    const only = parseCsv(onlyRaw);
    const ignore = parseCsv(ignoreRaw);
    const provider: Record<string, unknown> = {
      allow_fallbacks: allowFallbacks,
    };
    if (only.length) provider.only = only;
    if (ignore.length) provider.ignore = ignore;
    if (sort !== "default") provider.sort = sort;
    if (zdrOnly) {
      provider.zdr = true;
      provider.data_collection = "deny";
    }
    return provider;
  }

  async function previewRoute(model: string) {
    try {
      const res = await fetch("/api/v1/routing/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: applyOnline(model, online),
          messages: [{ role: "user", content: input || "preview" }],
          provider: providerPrefs(),
        }),
      });
      const json = await res.json();
      if (json.data) setRoute(json.data as RoutePreview);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    const model = lanes[0]?.model ?? defaultModel;
    const t = window.setTimeout(() => {
      void previewRoute(model);
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount + routing prefs
  }, [online, defaultModel, sort, allowFallbacks, zdrOnly, onlyRaw, ignoreRaw]);

  async function uploadInline(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/v1/files", { method: "POST", body: fd });
    const json = (await res.json()) as { data?: { id: string } };
    reloadFiles();
    if (json.data?.id) setFileIds((ids) => [...ids, json.data!.id]);
  }

  function filtered(query: string) {
    const q = query.trim().toLowerCase();
    const list = q ? models.filter((m) => `${m.id} ${m.name}`.toLowerCase().includes(q)) : models;
    return list.slice(0, 24);
  }

  function stop() {
    abortRef.current?.abort();
    setBusy(false);
  }

  async function streamOne(laneIndex: number, model: string, thread: Msg[], signal: AbortSignal) {
    const visible = thread.filter((m) => m.role !== "system");
    const headers = {
      "Content-Type": "application/json",
      "HTTP-Referer": origin,
      "X-Title": "Nexus Playground",
    };

    if (envelope !== "chat") {
      const path = envelope === "messages" ? "/api/v1/messages" : "/api/v1/responses";
      const body =
        envelope === "messages"
          ? {
              model: applyOnline(model, online),
              max_tokens: 1024,
              temperature,
              messages: thread,
              provider: providerPrefs(),
              ...(fileIds.length ? { file_ids: fileIds } : {}),
            }
          : {
              model: applyOnline(model, online),
              input: thread,
              max_output_tokens: 1024,
              temperature,
              provider: providerPrefs(),
              ...(fileIds.length ? { file_ids: fileIds } : {}),
            };
      const res = await fetch(path, { method: "POST", headers, signal, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message =
          res.status === 401
            ? guest
              ? "Necesitás sesión o una API key. Creá cuenta (incluye $1) o Entrá para chatear."
              : "Sesión expirada — volvé a entrar."
            : (json.error?.message ?? "Error de gateway");
        const messages = [...visible, { role: "assistant" as const, content: message }];
        setLanes((prev) =>
          prev.map((lane, i) => (i === laneIndex ? { ...lane, messages, stats: null } : lane)),
        );
        return { messages, stats: null as Stats | null };
      }
      let assistant = "";
      const meta: Stats = {
        id: json.nexus?.chat_id ?? json.metadata?.nexus_chat_id ?? json.id ?? "",
        provider: json.nexus?.provider ?? json.metadata?.provider ?? "",
        model: json.model ?? model,
        promptTokens: json.usage?.input_tokens ?? json.usage?.prompt_tokens,
        completionTokens: json.usage?.output_tokens ?? json.usage?.completion_tokens,
        cost: json.nexus?.cost ?? json.metadata?.cost,
      };
      if (envelope === "messages") {
        const blocks = Array.isArray(json.content) ? json.content : [];
        assistant = blocks
          .map((b: { text?: string }) => (typeof b?.text === "string" ? b.text : ""))
          .join("");
      } else {
        const out = Array.isArray(json.output) ? json.output : [];
        for (const item of out) {
          const parts = Array.isArray(item?.content) ? item.content : [];
          for (const p of parts) {
            if (typeof p?.text === "string") assistant += p.text;
          }
        }
      }
      const messages = [...visible, { role: "assistant" as const, content: assistant || "(vacío)" }];
      setLanes((prev) =>
        prev.map((lane, i) => (i === laneIndex ? { ...lane, messages, stats: meta } : lane)),
      );
      return { messages, stats: meta };
    }

    const res = await fetch("/api/v1/chat/completions", {
      method: "POST",
      headers,
      signal,
      body: JSON.stringify({
        model: applyOnline(model, online),
        messages: thread,
        stream: true,
        temperature,
        stream_options: { include_usage: true },
        provider: providerPrefs(),
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        ...(online ? { tools: [{ type: "nexus:web_search" }] } : {}),
        ...(fileIds.length ? { file_ids: fileIds } : {}),
      }),
    });
    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
      const message =
        res.status === 401
          ? guest
            ? "Necesitás sesión o una API key. Creá cuenta (incluye $1) o Entrá para chatear."
            : "Sesión expirada — volvé a entrar."
          : (err.error?.message ?? "Error de gateway");
      const messages = [...visible, { role: "assistant" as const, content: message }];
      setLanes((prev) =>
        prev.map((lane, i) => (i === laneIndex ? { ...lane, messages } : lane)),
      );
      return { messages, stats: null as Stats | null };
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let assistant = "";
    let meta: Stats = { id: res.headers.get("x-request-id") ?? "", provider: "", model };
    setLanes((prev) =>
      prev.map((lane, i) =>
        i === laneIndex ? { ...lane, messages: [...visible, { role: "assistant", content: "" }] } : lane,
      ),
    );
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
          const text = assistant;
          setLanes((prev) =>
            prev.map((lane, i) =>
              i === laneIndex ? { ...lane, messages: [...visible, { role: "assistant", content: text }] } : lane,
            ),
          );
        } catch {
          /* ignore */
        }
      }
    }
    const messages = [...visible, { role: "assistant" as const, content: assistant }];
    setLanes((prev) =>
      prev.map((lane, i) => (i === laneIndex ? { ...lane, messages, stats: meta } : lane)),
    );
    return { messages, stats: meta };
  }

  async function send() {
    if (!input.trim() || busy) return;
    const prompt = input;
    void previewRoute(lanes[0]?.model ?? defaultModel);
    setInput("");
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;
    const snapshot = lanes.map((lane) => {
      const thread: Msg[] = [
        ...(system ? [{ role: "system" as const, content: system }] : []),
        ...lane.messages.filter((m) => m.role !== "system"),
        { role: "user", content: prompt },
      ];
      return { model: lane.model, thread, visible: thread.filter((m) => m.role !== "system") };
    });
    setLanes((prev) => prev.map((lane, i) => ({ ...lane, messages: snapshot[i].visible, stats: null })));
    try {
      const results = await Promise.all(
        snapshot.map((s, i) => streamOne(i, s.model, s.thread, ac.signal)),
      );
      const first = results[0];
      if (first?.messages.length) {
        const title =
          first.messages.find((m) => m.role === "user")?.content.slice(0, 72) ||
          applyOnline(snapshot[0].model, online);
        upsertChatSession({
          id: sessionId,
          title,
          model: snapshot[0].model,
          messages: first.messages,
        });
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setLanes((prev) =>
          prev.map((lane) => ({
            ...lane,
            messages: [...lane.messages, { role: "assistant", content: "Error de red" }],
          })),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function shareThread() {
    const lane = lanes[0];
    if (!lane?.messages.length) return;
    setShareMsg(null);
    const res = await fetch("/api/v1/shares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: applyOnline(lane.model, online),
        messages: lane.messages,
        stats: lane.stats,
        comparing: lanes.length > 1,
        title: lane.messages.find((m) => m.role === "user")?.content.slice(0, 72),
      }),
    });
    const json = await res.json();
    if (!json.data?.url) {
      setShareMsg(json.error?.message ?? "No se pudo compartir");
      return;
    }
    const url = `${origin}${json.data.url}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareMsg(`Copiado: ${url}`);
    } catch {
      setShareMsg(url);
    }
  }

  const comparing = lanes.length > 1;

  return (
    <div className="grid gap-4">
      {sessions.length ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span className="uppercase tracking-wide text-zinc-600">Historial</span>
          {sessions.slice(0, 8).map((s) => (
            <button
              key={s.id}
              type="button"
              className={`max-w-[10rem] truncate rounded border px-2 py-1 text-left ${
                s.id === sessionId
                  ? "border-amber-400/40 text-amber-200"
                  : "border-white/10 text-zinc-400 hover:text-zinc-200"
              }`}
              onClick={() => {
                setSessionId(s.id);
                setLanes([{ model: s.model, query: "", messages: s.messages, stats: null }]);
              }}
              title={s.title}
            >
              {s.title || s.model}
            </button>
          ))}
          <button
            type="button"
            className="text-amber-400 hover:underline"
            onClick={() => {
              setSessionId(newSessionId());
              setLanes([{ model: defaultModel, query: "", messages: [], stats: null }]);
              setShareMsg(null);
            }}
          >
            Nueva
          </button>
          {sessions[0] ? (
            <button
              type="button"
              className="text-zinc-600 hover:text-rose-300"
              onClick={() => deleteChatSession(sessions[0].id)}
            >
              Borrar última
            </button>
          ) : null}
        </div>
      ) : null}
      {guest ? (
        <p className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-zinc-400">
          Guest · el route trace funciona; el completion pide sesión.{" "}
          <Link href="/register" className="text-amber-400 hover:underline">
            Crear cuenta
          </Link>
        </p>
      ) : null}
      {echoRisk || sawLocal ? (
        <p className="rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-sm text-amber-100">
          {sawLocal
            ? "La última respuesta fue eco local (sin key de lab)."
            : "Sin labs de plataforma ni BYOK: el chat responderá en eco local."}{" "}
          <Link href="/settings/byok" className="text-amber-400 hover:underline">
            BYOK
          </Link>
          {" · "}
          <Link href="/settings/connections" className="text-amber-400 hover:underline">
            Conexiones
          </Link>
        </p>
      ) : null}
      {route ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-zinc-400">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-zinc-200">
              Route trace · <span className="font-mono text-amber-400/90">{route.requested}</span>
            </span>
            <span className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-zinc-300">
              {route.mode}
            </span>
          </div>
          <p className="mb-2 text-zinc-500">{route.note}</p>
          <ol className="flex flex-wrap gap-1.5">
            {route.hops.slice(0, 12).map((hop, i) => (
              <li
                key={`${hop.model}-${hop.adapter}-${i}`}
                className={`rounded border px-1.5 py-0.5 font-mono ${
                  hop.wired
                    ? "border-emerald-500/40 text-emerald-300/90"
                    : "border-white/10 text-zinc-500"
                }`}
                title={hop.zdr ? "ZDR" : "standard"}
              >
                {hop.adapter}
                {hop.wired ? " ●" : ""}
              </li>
            ))}
            {route.hops.length > 12 ? (
              <li className="px-1 text-zinc-600">+{route.hops.length - 12}</li>
            ) : null}
          </ol>
        </div>
      ) : null}
      <div className={`grid gap-4 ${comparing ? "md:grid-cols-2" : ""}`}>
        {lanes.map((lane, index) => (
          <LanePicker
            key={index}
            lane={lane}
            presets={index === 0 ? presets : []}
            filtered={filtered(lane.query)}
            canRemove={comparing}
            onChange={(patch) => {
              setLanes((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
              if (patch.model && index === 0) void previewRoute(patch.model);
            }}
            onRemove={() => setLanes((prev) => prev.filter((_, i) => i !== index))}
          />
        ))}
      </div>
      {!comparing ? (
        <button
          type="button"
          className="text-left text-sm text-amber-400 hover:underline"
          onClick={() =>
            setLanes((prev) => [
              ...prev,
              { model: "nexus/free", query: "", messages: prev[0]?.messages ?? [], stats: null },
            ])
          }
        >
          Comparar con otro modelo
        </button>
      ) : null}
      <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-400">
        <label className="flex items-center gap-2">
          API
          <select
            value={envelope}
            onChange={(e) => setEnvelope(e.target.value as ApiEnvelope)}
            className="h-8 rounded-md border border-white/10 bg-zinc-950 px-2 font-mono text-xs text-zinc-200"
            aria-label="API envelope"
          >
            <option value="chat">/chat/completions</option>
            <option value="messages">/messages</option>
            <option value="responses">/responses</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} />
          :online
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={jsonMode}
            onChange={(e) => setJsonMode(e.target.checked)}
            disabled={envelope !== "chat"}
          />
          JSON
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
        <label className="cursor-pointer text-amber-400 hover:underline">
          Subir archivo
          <input
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadInline(f);
              e.target.value = "";
            }}
          />
        </label>
        <Link href="/docs/provider-routing" className="text-amber-400/80 hover:underline">
          Docs routing
        </Link>
      </div>
      <details className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
        <summary className="cursor-pointer text-sm text-zinc-300">
          Provider prefs · sort / only / ignore / ZDR
        </summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-xs text-zinc-500">
            sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="h-9 rounded-md border border-white/15 bg-black/40 px-2 font-mono text-sm text-zinc-200"
            >
              <option value="default">default</option>
              <option value="price">price</option>
              <option value="throughput">throughput</option>
              <option value="latency">latency</option>
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-400">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allowFallbacks}
                onChange={(e) => setAllowFallbacks(e.target.checked)}
              />
              allow_fallbacks
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={zdrOnly} onChange={(e) => setZdrOnly(e.target.checked)} />
              ZDR only
            </label>
          </div>
          <label className="grid gap-1 text-xs text-zinc-500">
            only (adapters)
            <input
              value={onlyRaw}
              onChange={(e) => setOnlyRaw(e.target.value)}
              placeholder="groq, together"
              className="h-9 rounded-md border border-white/15 bg-black/40 px-2 font-mono text-sm text-zinc-200"
            />
          </label>
          <label className="grid gap-1 text-xs text-zinc-500">
            ignore
            <input
              value={ignoreRaw}
              onChange={(e) => setIgnoreRaw(e.target.value)}
              placeholder="deepseek"
              className="h-9 rounded-md border border-white/15 bg-black/40 px-2 font-mono text-sm text-zinc-200"
            />
          </label>
        </div>
      </details>
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
      ) : (
        <p className="text-xs text-zinc-500">Sin archivos adjuntos. Subí uno o gestioná en Settings → Files.</p>
      )}
      <Textarea
        value={system}
        onChange={(e) => setSystem(e.target.value)}
        placeholder="System prompt (opcional)"
        className="min-h-16"
      />
      <div className={`grid gap-4 ${comparing ? "md:grid-cols-2" : ""}`}>
        {lanes.map((lane, index) => (
          <div key={index} className="min-h-[320px] space-y-3 border-t border-white/10 pt-4">
            <div className="font-mono text-[11px] text-amber-400/80">{applyOnline(lane.model, online)}</div>
            {lane.messages.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Un prompt, {comparing ? "dos modelos" : "un modelo"}. La key <code>sk-nx-</code> es para apps.
              </p>
            ) : (
              lane.messages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "text-amber-100" : "text-zinc-200"}>
                  <div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">{m.role}</div>
                  <div className="whitespace-pre-wrap text-sm">{m.content}</div>
                </div>
              ))
            )}
            {lane.stats ? (
              <p className="font-mono text-xs text-zinc-500">
                {lane.stats.id ? (
                  <Link href={`/activity/${lane.stats.id}`} className="text-amber-400 hover:underline">
                    {lane.stats.id}
                  </Link>
                ) : null}
                {lane.stats.provider ? ` · ${lane.stats.provider}` : ""}
                {lane.stats.promptTokens != null
                  ? ` · ${lane.stats.promptTokens}+${lane.stats.completionTokens ?? 0} tok`
                  : ""}
                {lane.stats.cost != null ? ` · ${formatUsd(lane.stats.cost)}` : ""}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      {lanes.every((l) => l.messages.length === 0) ? (
        <div className="flex flex-wrap gap-2">
          {STARTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setInput(s)}
              className="text-left text-sm text-zinc-500 hover:text-amber-300"
            >
              {s}
            </button>
          ))}
        </div>
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
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void send()} disabled={busy}>
            {busy ? "Generando…" : comparing ? "Enviar a ambos" : "Enviar"}
          </Button>
          {busy ? (
            <Button variant="outline" onClick={stop}>
              Stop
            </Button>
          ) : null}
          {lanes[0]?.messages.length ? (
            <Button variant="outline" onClick={() => void shareThread()} disabled={busy}>
              Compartir
            </Button>
          ) : null}
        </div>
        {shareMsg ? <p className="text-xs text-amber-300/90">{shareMsg}</p> : null}
      </div>
    </div>
  );
}

function LanePicker({
  lane,
  presets,
  filtered,
  canRemove,
  onChange,
  onRemove,
}: {
  lane: Lane;
  presets: PresetRow[];
  filtered: { id: string; name: string }[];
  canRemove: boolean;
  onChange: (patch: Partial<Lane>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex gap-2">
        <input
          value={lane.query || lane.model}
          onChange={(e) => onChange({ query: e.target.value, model: e.target.value })}
          placeholder="Buscar modelo…"
          className="h-9 flex-1 rounded-md border border-white/10 bg-transparent px-3 font-mono text-sm"
          aria-label="Modelo"
        />
        {canRemove ? (
          <Button variant="ghost" size="sm" onClick={onRemove}>
            Quitar
          </Button>
        ) : null}
      </div>
      <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
        {filtered.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange({ model: m.id, query: "" })}
            className={`rounded-md border px-2 py-1 font-mono text-[11px] ${
              lane.model === m.id ? "border-amber-400/60 text-amber-300" : "border-white/10 text-zinc-500"
            }`}
          >
            {m.id}
          </button>
        ))}
      </div>
      {presets.length ? (
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange({ model: `@${p.slug}`, query: "" })}
              className={`rounded-md border px-2 py-1 font-mono text-[11px] ${
                lane.model === `@${p.slug}` ? "border-amber-400/60 text-amber-300" : "border-white/10 text-zinc-500"
              }`}
            >
              @{p.slug}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
