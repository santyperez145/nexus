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
  author: string;
  free: boolean;
  created: number;
  contextLength: number;
  output: string[];
  pricing: { prompt: number; completion: number };
  endpoints: Array<{ adapter: string }>;
};

function matchesMod(m: Row, mod: string) {
  if (mod === "all") return true;
  if (mod === "embeddings") return m.output.some((o) => o.includes("embed"));
  if (mod === "audio") return m.output.some((o) => o === "audio" || o === "speech");
  return m.output.includes(mod);
}

const MODALITIES = [
  { id: "all", label: "Todos" },
  { id: "text", label: "Texto" },
  { id: "image", label: "Imagen" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
  { id: "embeddings", label: "Embeddings" },
] as const;

export function ModelsExplorer({ models }: { models: Row[] }) {
  const [q, setQ] = useState("");
  const [lab, setLab] = useState("all");
  const [mod, setMod] = useState<(typeof MODALITIES)[number]["id"]>("all");
  const [sort, setSort] = useState<"new" | "price" | "context">("new");
  const [table, setTable] = useState(false);
  const labs = useMemo(() => {
    const set = new Set<string>();
    for (const m of models) for (const e of m.endpoints) set.add(e.adapter);
    return [...set].sort();
  }, [models]);
  const filtered = models
    .filter((m) => {
      const hay = `${m.id} ${m.name} ${m.description} ${m.author}`.toLowerCase();
      if (q && !hay.includes(q.toLowerCase())) return false;
      if (lab !== "all") {
        if (m.id.startsWith("nexus/")) return lab === "nexus";
        if (!m.endpoints.some((e) => e.adapter === lab)) return false;
      }
      if (!matchesMod(m, mod)) return false;
      return true;
    })
    .slice()
    .sort((a, b) => {
      if (sort === "price") {
        return a.pricing.prompt + a.pricing.completion - (b.pricing.prompt + b.pricing.completion);
      }
      if (sort === "context") return b.contextLength - a.contextLength;
      return b.created - a.created;
    });

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {MODALITIES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setMod(item.id)}
            className={mod === item.id ? "text-amber-300" : "text-zinc-500 hover:text-white"}
          >
            {item.label}
            {item.id !== "all" ? (
              <span className="ml-1 text-zinc-600">{models.filter((m) => matchesMod(m, item.id)).length}</span>
            ) : null}
          </button>
        ))}
      </div>
      <div className="mb-6 grid gap-2 md:grid-cols-[1fr_160px_140px_auto]">
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
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="h-9 rounded-md border border-white/10 bg-zinc-950 px-3 text-sm"
          aria-label="Ordenar"
        >
          <option value="new">Más nuevos</option>
          <option value="price">Más baratos</option>
          <option value="context">Más contexto</option>
        </select>
        <button
          type="button"
          onClick={() => setTable((v) => !v)}
          className="h-9 text-left text-sm text-zinc-500 hover:text-white"
        >
          {table ? "Lista" : "Tabla"}
        </button>
      </div>
      <p className="mb-4 text-sm text-zinc-500">{filtered.length} modelos</p>
      {table ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-zinc-500">
              <tr>
                <th className="py-2 pr-4 font-medium">Modelo</th>
                <th className="py-2 pr-4 font-medium">Contexto</th>
                <th className="py-2 pr-4 font-medium">Prompt / 1M</th>
                <th className="py-2 font-medium">Labs</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="border-t border-white/5">
                  <td className="py-2 pr-4">
                    <Link href={`/models/${m.id}`} className="font-mono text-amber-400/80 hover:underline">
                      {m.id}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-zinc-400">{(m.contextLength / 1000).toFixed(0)}k</td>
                  <td className="py-2 pr-4 text-zinc-400">
                    {m.free ? "Gratis" : formatUsd(usdPerMillion(m.pricing.prompt), 2)}
                  </td>
                  <td className="py-2 text-zinc-600">{m.endpoints.map((e) => e.adapter).join(" · ") || "router"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-6">
          {filtered.map((m) => (
            <Link key={m.id} href={`/models/${m.id}`} className="block border-t border-white/10 pt-4 hover:border-amber-400/40">
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
              <p className="mt-2 font-mono text-[11px] text-zinc-600">
                {(m.contextLength / 1000).toFixed(0)}k ctx
                {m.endpoints.length ? ` · ${m.endpoints.map((e) => e.adapter).join(" · ")}` : " · router Nexus"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
