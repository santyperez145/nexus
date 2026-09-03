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
  input: string[];
  pricing: { prompt: number; completion: number };
  endpoints: Array<{ adapter: string; zdr?: boolean; verified?: boolean }>;
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
  const [table, setTable] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [latencyByModel, setLatencyByModel] = useState<Map<string, number>>(new Map());
  const [tokensByModel, setTokensByModel] = useState<Map<string, number>>(new Map());
  const router = useRouter();

  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/v1/datasets/models?window=30d", { signal: ac.signal })
      .then((r) => r.json())
      .then(
        (json: {
          data?: Array<{ model: string; avg_latency_ms: number | null; tokens?: number }>;
        }) => {
          const lat = new Map<string, number>();
          const tok = new Map<string, number>();
          for (const row of json.data ?? []) {
            if (row.avg_latency_ms != null) lat.set(row.model, row.avg_latency_ms);
            if (row.tokens != null && row.tokens > 0) tok.set(row.model, row.tokens);
          }
          setLatencyByModel(lat);
          setTokensByModel(tok);
        },
      )
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

  const trending = useMemo(() => {
    return [...tokensByModel.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id, tokens]) => ({ id, tokens, row: models.find((m) => m.id === id) }))
      .filter((t) => t.row);
  }, [tokensByModel, models]);

  return (
    <div>
      {trending.length ? (
        <div className="mb-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 bg-zinc-50/80 px-4 py-2 text-[11px] uppercase tracking-[0.06em] text-zinc-500">
            Trending 30d · tokens reales de esta instancia
          </div>
          <div className="flex gap-2 overflow-x-auto px-3 py-3">
            {trending.map((t, i) => (
              <Link
                key={t.id}
                href={`/models/${t.id}`}
                className="min-w-[10.5rem] shrink-0 rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2.5 transition-colors hover:border-amber-600/40"
              >
                <div className="font-mono text-[10px] text-zinc-400">#{i + 1}</div>
                <div className="mt-0.5 truncate font-mono text-xs text-amber-700">{t.id}</div>
                <div className="mt-1 tabular-nums text-[11px] text-zinc-500">
                  {t.tokens.toLocaleString()} tok
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

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
            {table ? "Vista cards" : "Vista tabla"}
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
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50/80 text-[11px] uppercase tracking-[0.06em] text-zinc-500">
                <tr>
                  <th className="w-8 px-2 py-2.5" />
                  <th className="px-3 py-2.5 font-medium">Modelo</th>
                  <th className="px-3 py-2.5 font-medium">Mod</th>
                  <th className="px-3 py-2.5 font-medium">Contexto</th>
                  <th className="px-3 py-2.5 font-medium">Prompt / 1M</th>
                  <th className="px-3 py-2.5 font-medium">Comp / 1M</th>
                  <th className="px-3 py-2.5 font-medium">Lat 30d</th>
                  <th className="px-3 py-2.5 font-medium">Labs</th>
                  <th className="px-3 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, i) => {
                  const on = selected.includes(m.id);
                  const lat = latencyByModel.get(m.id);
                  const vision = m.input?.includes("image");
                  const zdr = m.endpoints.some((e) => e.zdr);
                  const verified = m.endpoints.some((e) => e.verified);
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
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                          <span>{m.name}</span>
                          {vision ? (
                            <span className="rounded border border-violet-200 bg-violet-50 px-1 text-[10px] text-violet-800">
                              vision
                            </span>
                          ) : null}
                          {zdr ? (
                            <span className="rounded border border-sky-200 bg-sky-50 px-1 text-[10px] text-sky-800">
                              zdr
                            </span>
                          ) : null}
                          {verified ? (
                            <span className="rounded border border-amber-200 bg-amber-50 px-1 text-[10px] text-amber-900">
                              curated
                            </span>
                          ) : (
                            <span className="rounded border border-zinc-200 bg-zinc-50 px-1 text-[10px] text-zinc-500">
                              discovered
                            </span>
                          )}
                          {m.free ? (
                            <span className="rounded border border-emerald-200 bg-emerald-50 px-1 text-[10px] text-emerald-800">
                              free
                            </span>
                          ) : null}
                        </div>
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
                        {m.free ? "—" : formatUsd(usdPerMillion(m.pricing.completion), 2)}
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
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/chat?model=${encodeURIComponent(m.id)}`}
                          className="text-xs text-amber-700 hover:underline"
                        >
                          Try
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((m) => {
            const lat = latencyByModel.get(m.id);
            const on = selected.includes(m.id);
            const vision = m.input?.includes("image");
            const zdr = m.endpoints.some((e) => e.zdr);
            const verified = m.endpoints.some((e) => e.verified);
            return (
              <div
                key={m.id}
                className={`group relative overflow-hidden rounded-2xl border bg-white p-4 transition-colors ${
                  on ? "border-amber-600/50 ring-1 ring-amber-600/20" : "border-zinc-200 hover:border-amber-600/40"
                }`}
              >
                <div className="absolute right-3 top-3 flex items-center gap-2">
                  <Link
                    href={`/chat?model=${encodeURIComponent(m.id)}`}
                    className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] text-amber-800 opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    Try
                  </Link>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleSelect(m.id)}
                    aria-label={`Seleccionar ${m.id}`}
                    className="size-4"
                  />
                </div>
                <Link href={`/models/${m.id}`} className="block pr-16">
                  <div className="font-[family-name:var(--font-syne)] text-lg font-semibold tracking-tight text-zinc-950">
                    {m.name}
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-amber-700">{m.id}</div>
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-zinc-500">{m.description}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                    <span className="font-mono tabular-nums">
                      {m.free
                        ? "Gratis"
                        : `${formatUsd(usdPerMillion(m.pricing.prompt), 2)} / ${formatUsd(usdPerMillion(m.pricing.completion), 2)}`}
                    </span>
                    <span>·</span>
                    <span className="tabular-nums">{(m.contextLength / 1000).toFixed(0)}k ctx</span>
                    {lat != null ? (
                      <>
                        <span>·</span>
                        <span className="tabular-nums">{lat} ms</span>
                      </>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {vision ? (
                      <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-violet-800">
                        vision
                      </span>
                    ) : null}
                    {zdr ? (
                      <span className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-sky-800">
                        zdr
                      </span>
                    ) : null}
                    {verified ? (
                      <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-900">
                        curated
                      </span>
                    ) : (
                      <span className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
                        discovered
                      </span>
                    )}
                    {m.free ? (
                      <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-800">
                        free
                      </span>
                    ) : null}
                    {m.output.slice(0, 3).map((o) => (
                      <span
                        key={o}
                        className="rounded border border-zinc-200 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500"
                      >
                        {o}
                      </span>
                    ))}
                    {(m.endpoints.length ? m.endpoints.map((e) => e.adapter) : ["router"])
                      .slice(0, 3)
                      .map((a) => (
                        <span
                          key={`${m.id}-c-${a}`}
                          className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500"
                        >
                          {a}
                        </span>
                      ))}
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
