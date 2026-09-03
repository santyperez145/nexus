"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Vote = "a" | "b" | "tie";

type Stored = {
  a: string;
  b: string;
  vote: Vote;
  at: number;
};

const STORAGE_KEY = "nexus_arena_votes_v1";
const VOTES_EVENT = "nexus-arena-votes";
const EMPTY: Stored[] = [];

let cachedRaw: string | null = null;
let cachedVotes: Stored[] = EMPTY;

function parseVotes(raw: string | null): Stored[] {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as Stored[];
    return Array.isArray(parsed) ? parsed.slice(-40) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function getVotesSnapshot(): Stored[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedVotes;
  cachedRaw = raw;
  cachedVotes = parseVotes(raw);
  return cachedVotes;
}

function subscribeVotes(onChange: () => void) {
  const handler = () => onChange();
  window.addEventListener("storage", handler);
  window.addEventListener(VOTES_EVENT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(VOTES_EVENT, handler);
  };
}

function saveVote(entry: Omit<Stored, "at">) {
  const stamped: Stored = { ...entry, at: Date.now() };
  const next = [...getVotesSnapshot(), stamped].slice(-40);
  const raw = JSON.stringify(next);
  localStorage.setItem(STORAGE_KEY, raw);
  cachedRaw = raw;
  cachedVotes = next;
  window.dispatchEvent(new Event(VOTES_EVENT));
  return next;
}

export function ArenaClient({
  defaultA,
  defaultB,
  models,
}: {
  defaultA: string;
  defaultB: string;
  models: string[];
}) {
  const [a, setA] = useState(defaultA);
  const [b, setB] = useState(defaultB);
  const [prompt, setPrompt] = useState(
    "Explicá en 3 bullets por qué un gateway unificado de modelos es útil.",
  );
  const [outA, setOutA] = useState("");
  const [outB, setOutB] = useState("");
  const [busy, setBusy] = useState(false);
  const votes = useSyncExternalStore(subscribeVotes, getVotesSnapshot, () => EMPTY);
  const [msg, setMsg] = useState<string | null>(null);
  const [blind, setBlind] = useState(true);
  const [reveal, setReveal] = useState(false);
  const [swap, setSwap] = useState(false);

  const tallies = useMemo(() => {
    const map = new Map<string, { wins: number; losses: number; ties: number }>();
    for (const v of votes) {
      for (const id of [v.a, v.b]) {
        if (!map.has(id)) map.set(id, { wins: 0, losses: 0, ties: 0 });
      }
      if (v.vote === "tie") {
        map.get(v.a)!.ties += 1;
        map.get(v.b)!.ties += 1;
      } else if (v.vote === "a") {
        map.get(v.a)!.wins += 1;
        map.get(v.b)!.losses += 1;
      } else {
        map.get(v.b)!.wins += 1;
        map.get(v.a)!.losses += 1;
      }
    }
    return [...map.entries()]
      .map(([id, s]) => ({ id, ...s, score: s.wins - s.losses }))
      .sort((x, y) => y.score - x.score || y.wins - x.wins)
      .slice(0, 8);
  }, [votes]);

  async function runLane(model: string, setOut: (t: string) => void, signal: AbortSignal) {
    const res = await fetch("/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Title": "Nexus Arena",
        "X-Nexus-Guest": "1",
      },
      signal,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        stream: true,
        temperature: 0.7,
      }),
    });
    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
      setOut(
        res.status === 401
          ? "Auth requerida. Si ves esto en prod viejo, esperá el deploy — guest eco ya está en main."
          : (err.error?.message ?? `HTTP ${res.status}`),
      );
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n");
      buf = parts.pop() ?? "";
      for (const line of parts) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        try {
          const json = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const delta = json.choices?.[0]?.delta?.content ?? "";
          if (delta) {
            text += delta;
            setOut(text);
          }
        } catch {
          /* ignore */
        }
      }
    }
  }

  async function run() {
    if (!prompt.trim() || busy || a === b) return;
    setBusy(true);
    setMsg(null);
    setOutA("");
    setOutB("");
    setReveal(false);
    setSwap(Math.random() < 0.5);
    const ac = new AbortController();
    try {
      await Promise.all([runLane(a, setOutA, ac.signal), runLane(b, setOutB, ac.signal)]);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setMsg("Error de red");
    } finally {
      setBusy(false);
    }
  }

  function vote(v: Vote) {
    if (!outA || !outB) return;
    // Map UI lane vote through blind swap back to model A/B
    let mapped: Vote = v;
    if (blind && swap && (v === "a" || v === "b")) {
      mapped = v === "a" ? "b" : "a";
    }
    saveVote({ a, b, vote: mapped });
    setReveal(true);
    setMsg(
      mapped === "tie"
        ? "Empate guardado (solo en este dispositivo)."
        : `Voto ${mapped.toUpperCase()} → ${mapped === "a" ? a : b} (local).`,
    );
  }

  const left = swap
    ? { model: b, text: outB, ui: "a" as const }
    : { model: a, text: outA, ui: "a" as const };
  const right = swap
    ? { model: a, text: outA, ui: "b" as const }
    : { model: b, text: outB, ui: "b" as const };

  async function copyShare() {
    const body = [
      `Nexus Arena`,
      `A: ${a}`,
      `B: ${b}`,
      `Prompt: ${prompt.slice(0, 200)}`,
      `---`,
      outA.slice(0, 400),
      `---`,
      outB.slice(0, 400),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(body);
      setMsg("Resultado copiado (texto).");
    } catch {
      setMsg("No se pudo copiar.");
    }
  }

  return (
    <div>
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-xs uppercase tracking-wide text-zinc-500">Modelo A</span>
          <select
            value={a}
            onChange={(e) => setA(e.target.value)}
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 font-mono text-sm"
          >
            {models.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs uppercase tracking-wide text-zinc-500">Modelo B</span>
          <select
            value={b}
            onChange={(e) => setB(e.target.value)}
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 font-mono text-sm"
          >
            {models.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        className="mb-3 min-h-[88px] border-zinc-300 bg-white text-zinc-900"
        aria-label="Prompt arena"
      />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button
          className="bg-amber-600 text-white hover:bg-amber-700"
          disabled={busy || a === b}
          onClick={() => void run()}
        >
          {busy ? "Corriendo…" : "Correr A vs B"}
        </Button>
        <label className="flex items-center gap-2 text-sm text-zinc-600">
          <input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} />
          Blind (oculta slugs hasta votar)
        </label>
        <Button asChild variant="outline" className="border-zinc-300 bg-white text-zinc-900">
          <Link href={`/chat?model=${encodeURIComponent(a)}&compare=${encodeURIComponent(b)}`}>
            Abrir en Chat
          </Link>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!outA || !outB}
          onClick={() => void copyShare()}
        >
          Copiar resultado
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {[left, right].map((lane) => (
          <div key={lane.ui + lane.model} className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="mb-2 font-mono text-xs text-amber-700">
              {blind && !reveal ? `Modelo ${lane.ui.toUpperCase()}` : lane.model}
            </div>
            <pre className="min-h-[160px] whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
              {lane.text || (busy ? "…" : "—")}
            </pre>
            <Button
              size="sm"
              variant="outline"
              className="mt-3 border-zinc-300"
              disabled={!outA || !outB || busy}
              onClick={() => vote(lane.ui)}
            >
              Gana {lane.ui.toUpperCase()}
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" disabled={!outA || !outB || busy} onClick={() => vote("tie")}>
          Empate
        </Button>
      </div>
      {msg ? <p className="mt-3 text-sm text-amber-800">{msg}</p> : null}

      <section className="mt-10 border-t border-zinc-200 pt-8">
        <h2 className="font-[family-name:var(--font-syne)] text-xl font-semibold text-zinc-900">
          Tus votos (este browser)
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          No hay leaderboard global inventado — solo el historial local de este dispositivo.
        </p>
        {tallies.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">Todavía no votaste.</p>
        ) : (
          <ol className="mt-4 grid gap-2">
            {tallies.map((t, i) => (
              <li
                key={t.id}
                className="flex justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
              >
                <span className="font-mono text-amber-700">
                  #{i + 1} {t.id}
                </span>
                <span className="tabular-nums text-zinc-500">
                  {t.wins}W · {t.losses}L · {t.ties}T
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
