"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

export function ModelsExplorer({
  models,
  initialMod = "all",
  initialFree = false,
  initialAuthor = "all",
  initialLab = "all",
  initialSort = "new",
}: {
  models: Row[];
  initialMod?: (typeof MODALITIES)[number]["id"];
  initialFree?: boolean;
  initialAuthor?: string;
  initialLab?: string;
  initialSort?: "new" | "price" | "context" | "latency";
}) {
  const [q, setQ] = useState("");
  const [lab, setLab] = useState(initialLab);
  const [mod, setMod] = useState<(typeof MODALITIES)[number]["id"]>(initialMod);
  const [freeOnly, setFreeOnly] = useState(initialFree);
  const [author, setAuthor] = useState(initialAuthor);
  const [sort, setSort] = useState<"new" | "price" | "context" | "latency">(initialSort);
  const [table, setTable] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [latencyByModel, setLatencyByModel] = useState<Map<string, number>>(new Map());
  const router = useRouter();

  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/v1/datasets/models?window=30d", { signal: ac.signal })
      .then((r) => r.json())
      .then((json: { data?: Array<{ model: string; avg_latency_ms: number | null }> }) => {
        const map = new Map<string, number>();
        for (const row of json.data ?? []) {
          if (row.avg_latency_ms != null) map.set(row.model, row.avg_latency_ms);
        }
        setLatencyByModel(map);
      })
      .catch(() => undefined);
    return () => ac.abort();
  }, []);

  const labs = useMemo(() => {
    const set = new Set<string>();
    for (const m of models) for (const e of m.endpoints) set.add(e.adapter);
    return [...set].sort();
  }, [models]);
  const authors = useMemo(
    () =>
      [...new Set(models.map((m) => m.author).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 200),
    [models],
  );
  const modCounts = useMemo(() => {
    const map: Record<string, number> = { all: models.length };
    for (const item of MODALITIES) {
      if (item.id === "all") continue;
      map[item.id] = models.filter((m) => matchesMod(m, item.id)).length;
    }
    return map;
  }, [models]);

  function syncUrl(next: {
    mod?: string;
    free?: boolean;
    author?: string;
    lab?: string;
    sort?: string;
  }) {
    const params = new URLSearchParams();
    const m = next.mod ?? mod;
    const f = next.free ?? freeOnly;
    const a = next.author ?? author;
    const l = next.lab ?? lab;
    const s = next.sort ?? sort;
    if (m !== "all") params.set("mod", m);
    if (f) params.set("free", "1");
    if (a !== "all") params.set("author", a);
    if (l !== "all") params.set("lab", l);
    if (s !== "new") params.set("sort", s);
    const qs = params.toString();
    router.replace(qs ? `/models?${qs}` : "/models", { scroll: false });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }

  const filtered = models
    .filter((m) => {
      const hay = `${m.id} ${m.name} ${m.description} ${m.author}`.toLowerCase();
      if (q && !hay.includes(q.toLowerCase())) return false;
      if (freeOnly && !m.free) return false;
      if (author !== "all" && m.author !== author) return false;
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
      if (sort === "latency") {
        const la = latencyByModel.get(a.id) ?? Number.POSITIVE_INFINITY;
        const lb = latencyByModel.get(b.id) ?? Number.POSITIVE_INFINITY;
        if (la !== lb) return la - lb;
        return a.pricing.prompt - b.pricing.prompt;
      }
      return b.created - a.created;
    });

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-1 mb-5 space-y-3 border-b border-zinc-200 bg-[#fafaf9]/95 px-1 pb-4 pt-1 backdrop-blur">
        <div className="flex flex-wrap gap-1.5">
          {MODALITIES.map((item) => {
            const active = mod === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setMod(item.id);
                  syncUrl({ mod: item.id });
                }}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  active
                    ? "border-amber-600/40 bg-amber-50 text-amber-800"
                    : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-800"
                }`}
              >
                {item.label}
                <span className={`ml-1.5 tabular-nums ${active ? "text-amber-700/70" : "text-zinc-400"}`}>
                  {modCounts[item.id] ?? 0}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              const next = !freeOnly;
              setFreeOnly(next);
              syncUrl({ free: next });
            }}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              freeOnly
                ? "border-emerald-600/40 bg-emerald-50 text-emerald-800"
                : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-800"
            }`}
          >
            Free
          </button>
        </div>
        <div className="grid gap-2 md:grid-cols-[1fr_140px_140px_140px_auto]">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar modelo, autor, lab…"
            className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 shadow-sm"
            aria-label="Buscar modelos"
          />
          <select
            value={author}
            onChange={(e) => {
              setAuthor(e.target.value);
              syncUrl({ author: e.target.value });
            }}
            className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900"
            aria-label="Filtrar por autor"
          >
            <option value="all">Todos los autores</option>
            {authors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select
            value={lab}
            onChange={(e) => {
              setLab(e.target.value);
              syncUrl({ lab: e.target.value });
            }}
            className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900"
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
            onChange={(e) => {
              const next = e.target.value as typeof sort;
              setSort(next);
              syncUrl({ sort: next });
            }}
            className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900"
            aria-label="Ordenar"
          >
            <option value="new">Más nuevos</option>
            <option value="price">Más baratos</option>
            <option value="context">Más contexto</option>
            <option value="latency">Latencia medida</option>
          </select>
          <button
            type="button"
            onClick={() => setTable((v) => !v)}
            className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-600 hover:text-zinc-900"
          >
            {table ? "Vista lista" : "Vista tabla"}
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
          <p>
            <span className="font-medium text-zinc-700">{filtered.length}</span> modelos · catálogo vivo
            {sort === "latency" ? " · latencia de generations 30d" : ""}
          </p>
          {selected.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-zinc-600">{selected.join(" · ")}</span>
              {selected.length === 2 ? (
                <Link
                  href={`/compare?a=${encodeURIComponent(selected[0])}&b=${encodeURIComponent(selected[1])}`}
                  className="rounded-md border border-amber-600/40 bg-amber-50 px-2 py-1 text-amber-900 hover:underline"
                >
                  Compare
                </Link>
              ) : (
                <span className="text-zinc-400">Elegí 2 para compare</span>
              )}
              <button type="button" className="text-zinc-500 hover:text-zinc-800" onClick={() => setSelected([])}>
                Limpiar
              </button>
            </div>
          ) : (
            <span className="text-zinc-400">Marcá 2 modelos para compare</span>
          )}
        </div>
      </div>

      {table ? (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50/80 text-[11px] uppercase tracking-[0.06em] text-zinc-500">
                <tr>
                  <th className="w-8 px-2 py-2.5" />
                  <th className="px-3 py-2.5 font-medium">Modelo</th>
                  <th className="px-3 py-2.5 font-medium">Mod</th>
                  <th className="px-3 py-2.5 font-medium">Contexto</th>
                  <th className="px-3 py-2.5 font-medium">Prompt / 1M</th>
                  <th className="px-3 py-2.5 font-medium">Lat 30d</th>
                  <th className="px-3 py-2.5 font-medium">Labs</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, i) => {
                  const on = selected.includes(m.id);
                  const lat = latencyByModel.get(m.id);
                  return (
                    <tr
                      key={m.id}
                      className={`border-t border-zinc-100 hover:bg-amber-50/40 ${i % 2 ? "bg-zinc-50/40" : ""}`}
                    >
                      <td className="px-2 py-2.5">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleSelect(m.id)}
                          aria-label={`Seleccionar ${m.id}`}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <Link href={`/models/${m.id}`} className="font-mono text-[13px] text-amber-700 hover:underline">
                          {m.id}
                        </Link>
                        <div className="mt-0.5 text-xs text-zinc-500">{m.name}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {m.output.slice(0, 3).map((o) => (
                            <span
                              key={o}
                              className="rounded border border-zinc-200 px-1 py-0.5 font-mono text-[10px] text-zinc-500"
                            >
                              {o}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-zinc-600">
                        {(m.contextLength / 1000).toFixed(0)}k
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-zinc-600">
                        {m.free ? "Gratis" : formatUsd(usdPerMillion(m.pricing.prompt), 2)}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-zinc-500">
                        {lat != null ? `${lat} ms` : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {(m.endpoints.map((e) => e.adapter).length
                            ? m.endpoints.map((e) => e.adapter)
                            : ["nexus"]
                          )
                            .slice(0, 4)
                            .map((a) => (
                              <span
                                key={`${m.id}-${a}`}
                                className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-zinc-500"
                              >
                                {a}
                              </span>
                            ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid gap-0">
          {filtered.map((m) => (
            <Link
              key={m.id}
              href={`/models/${m.id}`}
              className="block border-t border-zinc-200 py-4 transition-colors hover:border-amber-600"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <div className="font-medium text-zinc-900">{m.name}</div>
                  <div className="font-mono text-xs text-amber-700/90">{m.id}</div>
                </div>
                <div className="text-sm text-zinc-500">
                  {m.free
                    ? "Gratis"
                    : `${formatUsd(usdPerMillion(m.pricing.prompt), 2)} / ${formatUsd(usdPerMillion(m.pricing.completion), 2)} per 1M`}
                </div>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-zinc-500">{m.description}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="rounded border border-zinc-200 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
                  {(m.contextLength / 1000).toFixed(0)}k ctx
                </span>
                {(m.endpoints.length ? m.endpoints.map((e) => e.adapter) : ["router"]).map((a) => (
                  <span
                    key={`${m.id}-l-${a}`}
                    className="rounded border border-zinc-200 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
