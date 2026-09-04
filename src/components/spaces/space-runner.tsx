"use client";

import { useState } from "react";
import { ArrowUp, Bot, LoaderCircle, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";

type Message = { role: "user" | "assistant"; content: string };

export function SpaceRunner({
  namespace,
  slug,
  starterPrompt,
}: {
  namespace: string;
  slug: string;
  starterPrompt?: string | null;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState(starterPrompt ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ model?: string; provider?: string; cost?: number } | null>(null);

  async function submit() {
    const content = prompt.trim();
    if (!content || busy) return;
    const nextMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setPrompt("");
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/spaces/${encodeURIComponent(namespace)}/${encodeURIComponent(slug)}/run`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: nextMessages }),
        },
      );
      const json = (await response.json().catch(() => ({}))) as {
        model?: string;
        provider?: string;
        choices?: Array<{ message?: { content?: string | null } }>;
        usage?: { cost?: number };
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? "Ingresá a Nexus o usá una clave de inferencia para ejecutar este Space."
            : json.error?.message ?? `Ejecución rechazada (${response.status})`,
        );
      }
      const answer = json.choices?.[0]?.message?.content;
      if (!answer) throw new Error("El proveedor no devolvió contenido de texto.");
      setMessages([...nextMessages, { role: "assistant", content: answer }]);
      setMeta({ model: json.model, provider: json.provider, cost: json.usage?.cost });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo ejecutar el Space");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-indigo-950/10 bg-white shadow-[0_18px_70px_rgba(17,19,38,0.07)]">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-5 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.1)]" />
          Runtime Nexus
        </div>
        {meta ? (
          <div className="font-mono text-[10px] text-zinc-500">
            {meta.provider ?? "router"} · {meta.cost != null ? `$${meta.cost.toFixed(6)}` : "ledger"}
          </div>
        ) : null}
      </div>

      <div className="nexus-console-grid min-h-[24rem] bg-[#0b0e1a] p-4 text-zinc-100 md:p-6">
        {!messages.length ? (
          <div className="grid min-h-[18rem] place-items-center text-center">
            <div>
              <div className="mx-auto grid size-11 place-items-center rounded-xl border border-white/10 bg-white/5">
                <Bot className="size-5 text-cyan-300" />
              </div>
              <h2 className="mt-4 font-semibold text-white">Listo para ejecutar</h2>
              <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-zinc-400">
                La conversación usa el modelo y las instrucciones publicadas por el creador. El gateway aplica privacidad, límites y facturación de tu cuenta.
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto grid max-w-3xl gap-4">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                {message.role === "assistant" ? <Bot className="mt-2 size-4 shrink-0 text-cyan-300" /> : null}
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "bg-indigo-500 text-white" : "border border-white/10 bg-white/[0.06] text-zinc-200"}`}>
                  {message.content}
                </div>
                {message.role === "user" ? <UserRound className="mt-2 size-4 shrink-0 text-indigo-200" /> : null}
              </div>
            ))}
            {busy ? <div className="flex items-center gap-2 text-xs text-zinc-400"><LoaderCircle className="size-4 animate-spin text-cyan-300" /> Enrutando entre proveedores…</div> : null}
          </div>
        )}
      </div>

      <div className="border-t border-zinc-200 bg-zinc-50/70 p-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-xl border border-zinc-200 bg-white p-2 shadow-sm focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            rows={2}
            maxLength={128_000}
            placeholder="Escribí un mensaje…"
            aria-label="Mensaje para el Space"
            className="min-h-12 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
          />
          <Button size="icon" onClick={() => void submit()} disabled={busy || !prompt.trim()} aria-label="Ejecutar">
            <ArrowUp className="size-4" />
          </Button>
        </div>
        {error ? <p className="mx-auto mt-2 max-w-3xl text-xs text-red-600">{error}</p> : null}
      </div>
    </section>
  );
}

