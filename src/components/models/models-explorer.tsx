"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatUsd } from "@/lib/money";

function usdPerMillion(perToken: number) {
  return perToken * 1_000_000;
}

type Row = {
  id: string;
  name: string;
  description: string;
  free: boolean;
  pricing: { prompt: number; completion: number };
  endpoints: Array<{ adapter: string }>;
};

export function ModelsExplorer({ models }: { models: Row[] }) {
  const [q, setQ] = useState("");
  const [lab, setLab] = useState("all");
  const labs = useMemo(() => {
    const set = new Set<string>();
    for (const m of models) for (const e of m.endpoints) set.add(e.adapter);
    return [...set].sort();
  }, [models]);
  const filtered = models.filter((m) => {
    const hay = `${m.id} ${m.name} ${m.description}`.toLowerCase();
    if (q && !hay.includes(q.toLowerCase())) return false;
    if (lab !== "all") {
      if (m.id.startsWith("nexus/")) return lab === "nexus";
      return m.endpoints.some((e) => e.adapter === lab);
    }
    return true;
  });

  return (
    <div>
      <div className="mb-6 grid gap-2 md:grid-cols-[1fr_200px]">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar modelo, autor, lab…"
          className="h-9 rounded-md border border-white/10 bg-transparent px-3 text-sm"
          aria-label="Buscar modelos"
        />
        <select
          value={lab}
          onChange={(e) => setLab(e.target.value)}
          className="h-9 rounded-md border border-white/10 bg-zinc-950 px-3 text-sm"
          aria-label="Filtrar por lab"
        >
          <option value="all">Todos los labs</option>
          {labs.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <p className="mb-4 text-sm text-zinc-500">{filtered.length} modelos</p>
      <div className="grid gap-3">
        {filtered.map((m) => (
          <Link
            key={m.id}
            href={`/models/${m.id}`}
            className="rounded-xl border border-white/10 bg-white/5 p-4 hover:border-amber-400/40"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <div className="font-medium text-white">{m.name}</div>
                <div className="font-mono text-xs text-amber-400/80">{m.id}</div>
              </div>
              <div className="text-sm text-zinc-400">
                {m.free
                  ? "Gratis"
                  : `${formatUsd(usdPerMillion(m.pricing.prompt), 2)} / ${formatUsd(usdPerMillion(m.pricing.completion), 2)} per 1M`}
              </div>
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-zinc-500">{m.description}</p>
            {m.endpoints.length ? (
              <p className="mt-2 font-mono text-[11px] text-zinc-600">
                {m.endpoints.length} lab{m.endpoints.length === 1 ? "" : "s"} ·{" "}
                {m.endpoints.map((e) => e.adapter).join(" · ")}
              </p>
            ) : (
              <p className="mt-2 text-[11px] text-zinc-600">Router Nexus</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
