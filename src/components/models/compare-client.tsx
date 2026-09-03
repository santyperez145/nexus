"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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

export function CompareClient({ models }: { models: Row[] }) {
  const [a, setA] = useState(models[0]?.id ?? "nexus/auto");
  const [b, setB] = useState(models[1]?.id ?? models[0]?.id ?? "nexus/auto");
  const left = useMemo(() => models.find((m) => m.id === a) ?? models[0], [a, models]);
  const right = useMemo(() => models.find((m) => m.id === b) ?? models[1] ?? models[0], [b, models]);

  if (!left || !right) {
    return <p className="text-sm text-zinc-500">Catálogo vacío.</p>;
  }

  const rows: Array<{ label: string; av: string; bv: string }> = [
    { label: "Nombre", av: left.name, bv: right.name },
    {
      label: "Contexto",
      av: `${(left.contextLength / 1000).toFixed(0)}k`,
      bv: `${(right.contextLength / 1000).toFixed(0)}k`,
    },
    {
      label: "Prompt / 1M",
      av: left.free ? "Gratis" : formatUsd(usdPerMillion(left.pricing.prompt), 2),
      bv: right.free ? "Gratis" : formatUsd(usdPerMillion(right.pricing.prompt), 2),
    },
    {
      label: "Completion / 1M",
      av: left.free ? "—" : formatUsd(usdPerMillion(left.pricing.completion), 2),
      bv: right.free ? "—" : formatUsd(usdPerMillion(right.pricing.completion), 2),
    },
    {
      label: "Labs",
      av: left.endpoints.map((e) => e.adapter).join(", ") || "router",
      bv: right.endpoints.map((e) => e.adapter).join(", ") || "router",
    },
    {
      label: "Latencia min",
      av: left.endpoints.length
        ? `${Math.min(...left.endpoints.map((e) => e.latencyMs))} ms`
        : "—",
      bv: right.endpoints.length
        ? `${Math.min(...right.endpoints.map((e) => e.latencyMs))} ms`
        : "—",
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

  return (
    <div>
      <div className="mb-6 grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-xs uppercase tracking-[0.08em] text-zinc-500">Modelo A</span>
          <select
            value={a}
            onChange={(e) => setA(e.target.value)}
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 font-mono text-sm text-zinc-900"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs uppercase tracking-[0.08em] text-zinc-500">Modelo B</span>
          <select
            value={b}
            onChange={(e) => setB(e.target.value)}
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 font-mono text-sm text-zinc-900"
          >
            {models.map((m) => (
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
            <div className="font-mono text-xs text-zinc-800">{r.av}</div>
            <div className="font-mono text-xs text-zinc-800">{r.bv}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button asChild className="bg-amber-600 text-white hover:bg-amber-700">
          <Link
            href={`/chat?model=${encodeURIComponent(left.id)}&compare=${encodeURIComponent(right.id)}`}
          >
            Probar en chat (A vs B)
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
