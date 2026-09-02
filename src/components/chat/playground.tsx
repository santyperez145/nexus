"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Msg = { role: "user" | "assistant" | "system"; content: string };

export function Playground({ models }: { models: { id: string; name: string }[] }) {
  const [model, setModel] = useState("nexus/auto");
  const [input, setInput] = useState("");
  const [system, setSystem] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [online, setOnline] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const list = useMemo(() => models, [models]);
  const slug = online && !model.includes(":online") ? `${model}:online` : model;
  const snippet = `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${typeof window !== "undefined" ? window.location.origin : ""}/api/v1",
  apiKey: process.env.NEXUS_API_KEY,
});

await client.chat.completions.create({
  model: "${slug}",
  messages: [{ role: "user", content: "Hola" }],
  ${online ? 'tools: [{ type: "nexus:web_search" }],' : ""}
});`;

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
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          model: slug,
          messages: next,
          stream: true,
          temperature,
          ...(online ? { tools: [{ type: "nexus:web_search" }] } : {}),
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
            const json = JSON.parse(line);
            const delta = json.choices?.[0]?.delta?.content ?? "";
            assistant += delta;
            setMessages([...visible, { role: "assistant", content: assistant }]);
          } catch {
            /* ignore */
          }
        }
      }
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
      <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
        <Select value={model} onValueChange={setModel}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Modelo" />
          </SelectTrigger>
          <SelectContent>
            {list.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} />
          :online
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
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
      <Textarea
        value={system}
        onChange={(e) => setSystem(e.target.value)}
        placeholder="System prompt (opcional)"
        className="min-h-16"
      />
      <div className="min-h-[360px] space-y-3 rounded-xl border border-white/10 bg-black/30 p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Chat con tu sesión. Key <code>sk-nx-</code> para apps. Activá <code>:online</code> para
            búsqueda web (Tavily/Brave/Exa/Serper o DuckDuckGo).
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
      <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-zinc-400">
        {snippet}
      </pre>
    </div>
  );
}
