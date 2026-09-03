"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatUsd } from "@/lib/money";

type Row = {
  id: string;
  name: string;
  contextLength: number;
  free: boolean;
  pricing: { prompt: number; completion: number };
  endpoints: Array<{ adapter: string; latencyMs: number; throughputTps: number; zdr: boolean }>;
  output: string[];
};

function usdPerMillion(perToken: number) {
  return perToken * 1_000_000;
}

function costForTokens(
  promptPerM: number,
  completionPerM: number,
  tokens: number,
  free: boolean,
  promptShare = 0.5,
) {
  if (free) return 0;
  const promptN = tokens * promptShare;
  const completionN = tokens * (1 - promptShare);
  return (promptN / 1_000_000) * promptPerM + (completionN / 1_000_000) * completionPerM;
}

export function CompareClient({
  models,
  initialA,
  initialB,
}: {
  models: Row[];
  initialA?: string;
  initialB?: string;
}) {
  const router = useRouter();
  const [a, setA] = useState(initialA ?? models[0]?.id ?? "nexus/auto");
  const [b, setB] = useState(initialB ?? models[1]?.id ?? models[0]?.id ?? "nexus/auto");
  const [qa, setQa] = useState("");
  const [qb, setQb] = useState("");
  const [promptShare, setPromptShare] = useState(0.5);
  const left = useMemo(() => models.find((m) => m.id === a) ?? models[0], [a, models]);
  const right = useMemo(() => models.find((m) => m.id === b) ?? models[1] ?? models[0], [b, models]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (a) params.set("a", a);
    if (b) params.set("b", b);
    router.replace(`/compare?${params.toString()}`, { scroll: false });
  }, [a, b, router]);

  const optsA = useMemo(() => {
    const q = qa.trim().toLowerCase();
    return q ? models.filter((m) => m.id.toLowerCase().includes(q)).slice(0, 80) : models.slice(0, 120);
  }, [models, qa]);
  const optsB = useMemo(() => {
    const q = qb.trim().toLowerCase();
    return q ? models.filter((m) => m.id.toLowerCase().includes(q)).slice(0, 80) : models.slice(0, 120);
  }, [models, qb]);

  if (!left || !right) {
    return <p className="text-sm text-zinc-500">Catálogo vacío.</p>;
  }

  const leftPrompt = left.free ? 0 : usdPerMillion(left.pricing.prompt);
  const rightPrompt = right.free ? 0 : usdPerMillion(right.pricing.prompt);
  const leftComp = left.free ? 0 : usdPerMillion(left.pricing.completion);
  const rightComp = right.free ? 0 : usdPerMillion(right.pricing.completion);
  const cheaper = leftPrompt === rightPrompt ? null : leftPrompt < rightPrompt ? "a" : "b";
  const biggerCtx =
    left.contextLength === right.contextLength ? null : left.contextLength > right.contextLength ? "a" : "b";

  const leftLat = left.endpoints.length ? Math.min(...left.endpoints.map((e) => e.latencyMs)) : null;
  const rightLat = right.endpoints.length ? Math.min(...right.endpoints.map((e) => e.latencyMs)) : null;
  const faster =
    leftLat == null || rightLat == null || leftLat === rightLat ? null : leftLat < rightLat ? "a" : "b";

  const leftTps = left.endpoints.length ? Math.max(...left.endpoints.map((e) => e.throughputTps)) : null;
  const rightTps = right.endpoints.length ? Math.max(...right.endpoints.map((e) => e.throughputTps)) : null;
  const higherTps =
    leftTps == null || rightTps == null || leftTps === rightTps ? null : leftTps > rightTps ? "a" : "b";

  const rows: Array<{ label: string; av: string; bv: string; win?: "a" | "b" | null }> = [
    { label: "Nombre", av: left.name, bv: right.name },
    {
      label: "Contexto",
      av: `${(left.contextLength / 1000).toFixed(0)}k`,
      bv: `${(right.contextLength / 1000).toFixed(0)}k`,
      win: biggerCtx,
    },
    {
      label: "Prompt / 1M",
      av: left.free ? "Gratis" : formatUsd(leftPrompt, 2),
      bv: right.free ? "Gratis" : formatUsd(rightPrompt, 2),
      win: cheaper,
    },
    {
      label: "Completion / 1M",
      av: left.free ? "—" : formatUsd(leftComp, 2),
      bv: right.free ? "—" : formatUsd(rightComp, 2),
    },
    {
      label: "Labs",
      av: left.endpoints.map((e) => e.adapter).join(", ") || "router",
      bv: right.endpoints.map((e) => e.adapter).join(", ") || "router",
    },
    {
      label: "Latencia min",
      av: leftLat != null ? `${leftLat} ms` : "—",
      bv: rightLat != null ? `${rightLat} ms` : "—",
      win: faster,
    },
    {
      label: "Throughput max",
      av: leftTps != null ? `${leftTps} tps` : "—",
      bv: rightTps != null ? `${rightTps} tps` : "—",
      win: higherTps,
    },
    {
      label: "ZDR host",
      av: left.endpoints.some((e) => e.zdr) ? "sí" : "no",
      bv: right.endpoints.some((e) => e.zdr) ? "sí" : "no",
    },
    {
      label: "Salida",
      av: left.output.join(", ") || "—",
      bv: right.output.join(", ") || "—",
    },
  ];

  const volumes = [1_000, 10_000, 100_000] as const;

  return (
    <div>
      <div className="mb-6 grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-xs uppercase tracking-[0.08em] text-zinc-500">Modelo A</span>
          <input
            value={qa}
            onChange={(e) => setQa(e.target.value)}
            placeholder="Filtrar…"
            className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm"
            aria-label="Filtrar modelo A"
          />
          <select
            value={a}
            onChange={(e) => setA(e.target.value)}
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 font-mono text-sm text-zinc-900"
          >
            {optsA.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs uppercase tracking-[0.08em] text-zinc-500">Modelo B</span>
          <input
            value={qb}
            onChange={(e) => setQb(e.target.value)}
            placeholder="Filtrar…"
            className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm"
            aria-label="Filtrar modelo B"
          />
          <select
            value={b}
            onChange={(e) => setB(e.target.value)}
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 font-mono text-sm text-zinc-900"
          >
            {optsB.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="grid grid-cols-[8rem_1fr_1fr] gap-2 border-b border-zinc-200 bg-zinc-50/80 px-3 py-2 text-[11px] uppercase tracking-[0.06em] text-zinc-500">
          <span>Campo</span>
          <span className="truncate font-mono normal-case tracking-normal text-amber-700">{left.id}</span>
          <span className="truncate font-mono normal-case tracking-normal text-amber-700">{right.id}</span>
        </div>
        {rows.map((r, i) => (
          <div
            key={r.label}
            className={`grid grid-cols-[8rem_1fr_1fr] gap-2 px-3 py-2.5 text-sm ${
              i ? "border-t border-zinc-100" : ""
            }`}
          >
            <div className="text-zinc-500">{r.label}</div>
            <div
              className={`font-mono text-xs ${
                r.win === "a" ? "font-semibold text-emerald-700" : "text-zinc-800"
              }`}
            >
              {r.av}
              {r.win === "a" ? " ·" : ""}
            </div>
            <div
              className={`font-mono text-xs ${
                r.win === "b" ? "font-semibold text-emerald-700" : "text-zinc-800"
              }`}
            >
              {r.bv}
              {r.win === "b" ? " ·" : ""}
            </div>
          </div>
        ))}
      </div>

      <section className="mt-8">
        <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold text-zinc-900">
          Costo estimado
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Split prompt/completion ajustable. Lista — 0% markup en tokens.
        </p>
        <label className="mt-3 flex max-w-md flex-wrap items-center gap-3 text-sm text-zinc-600">
          Prompt share
          <input
            type="range"
            min={10}
            max={90}
            step={5}
            value={Math.round(promptShare * 100)}
            onChange={(e) => setPromptShare(Number(e.target.value) / 100)}
            className="flex-1"
            aria-label="Prompt share percent"
          />
          <span className="w-24 font-mono text-xs">
            {Math.round(promptShare * 100)}% / {Math.round((1 - promptShare) * 100)}%
          </span>
        </label>
        <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="grid grid-cols-[6rem_1fr_1fr] gap-2 border-b border-zinc-200 bg-zinc-50/80 px-3 py-2 text-[11px] uppercase tracking-[0.06em] text-zinc-500">
            <span>Tokens</span>
            <span>A</span>
            <span>B</span>
          </div>
          {volumes.map((n, i) => {
            const ca = costForTokens(leftPrompt, leftComp, n, left.free, promptShare);
            const cb = costForTokens(rightPrompt, rightComp, n, right.free, promptShare);
            const win = ca === cb ? null : ca < cb ? "a" : "b";
            return (
              <div
                key={n}
                className={`grid grid-cols-[6rem_1fr_1fr] gap-2 px-3 py-2.5 text-sm ${
                  i ? "border-t border-zinc-100" : ""
                }`}
              >
                <span className="tabular-nums text-zinc-500">{n.toLocaleString()}</span>
                <span className={`font-mono text-xs ${win === "a" ? "font-semibold text-emerald-700" : ""}`}>
                  {formatUsd(ca, 4)}
                </span>
                <span className={`font-mono text-xs ${win === "b" ? "font-semibold text-emerald-700" : ""}`}>
                  {formatUsd(cb, 4)}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button asChild className="bg-amber-600 text-white hover:bg-amber-700">
          <Link
            href={`/chat?model=${encodeURIComponent(left.id)}&compare=${encodeURIComponent(right.id)}`}
          >
            Probar en chat (A vs B)
          </Link>
        </Button>
        <Button asChild variant="outline" className="border-zinc-300 bg-white text-zinc-900">
          <Link href={`/arena?a=${encodeURIComponent(left.id)}&b=${encodeURIComponent(right.id)}`}>
            Arena
          </Link>
        </Button>
        <Button asChild variant="outline" className="border-zinc-300 bg-white text-zinc-900">
          <Link href={`/models/${left.id}`}>Detalle A</Link>
        </Button>
        <Button asChild variant="outline" className="border-zinc-300 bg-white text-zinc-900">
          <Link href={`/models/${right.id}`}>Detalle B</Link>
        </Button>
      </div>
    </div>
  );
}
