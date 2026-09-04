"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatUsd } from "@/lib/money";

export type RankingRow = {
  id: string;
  promptPerM: number;
  free: boolean;
  tokens: number;
  requests: number;
  latencyMs: number | null;
  measured?: boolean;
  providers?: string[];
  vision?: boolean;
  modality?: string;
};

type Sort = "popular" | "price" | "latency";
type Modality = "all" | "text" | "vision";
const PAGE_SIZE = 25;

export function RankingsClient({
  rows,
  windowKey = "all",
  initialPage = 1,
  initialSort = "popular",
  initialFree = false,
  initialModality = "all",
}: {
  rows: RankingRow[];
  windowKey?: string;
  initialPage?: number;
  initialSort?: Sort;
  initialFree?: boolean;
  initialModality?: Modality;
}) {
  const router = useRouter();
  const [sort, setSort] = useState<Sort>(initialSort);
  const [freeOnly, setFreeOnly] = useState(initialFree);
  const [modality, setModality] = useState<Modality>(initialModality);
  const [page, setPage] = useState(initialPage);

  const ranked = useMemo(() => {
    const list = rows.filter((r) => {
      if (freeOnly && !r.free) return false;
      if (modality === "vision" && !r.vision) return false;
      if (modality === "text" && r.vision) return false;
      return true;
    });
    if (sort === "price") {
      list.sort((a, b) => {
        if (a.free !== b.free) return a.free ? -1 : 1;
        return a.promptPerM - b.promptPerM;
      });
    } else if (sort === "latency") {
      list.sort((a, b) => {
        const la = a.latencyMs ?? Number.POSITIVE_INFINITY;
        const lb = b.latencyMs ?? Number.POSITIVE_INFINITY;
        if (la !== lb) return la - lb;
        return a.promptPerM - b.promptPerM;
      });
    } else {
      list.sort((a, b) => {
        if (b.tokens !== a.tokens) return b.tokens - a.tokens;
        return a.promptPerM - b.promptPerM;
      });
    }
    return list;
  }, [rows, sort, freeOnly, modality]);

  const pageCount = Math.max(1, Math.ceil(ranked.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visible = ranked.slice(start, start + PAGE_SIZE);

  function syncUrl(next: { page?: number; sort?: Sort; free?: boolean; modality?: Modality }) {
    const params = new URLSearchParams();
    const nextPage = next.page ?? page;
    const nextSort = next.sort ?? sort;
    const nextFree = next.free ?? freeOnly;
    const nextModality = next.modality ?? modality;
    if (windowKey !== "all") params.set("window", windowKey);
    if (nextSort !== "popular") params.set("sort", nextSort);
    if (nextFree) params.set("free", "1");
    if (nextModality !== "all") params.set("modality", nextModality);
    if (nextPage > 1) params.set("page", String(nextPage));
    const query = params.toString();
    router.replace(query ? `/rankings?${query}` : "/rankings", { scroll: false });
  }

  function goToPage(nextPage: number) {
    setPage(nextPage);
    syncUrl({ page: nextPage });
    document.getElementById("ranking-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function changeSort(next: Sort) {
    setSort(next);
    setPage(1);
    syncUrl({ sort: next, page: 1 });
  }

  function changeFree(next: boolean) {
    setFreeOnly(next);
    setPage(1);
    syncUrl({ free: next, page: 1 });
  }

  function changeModality(next: Modality) {
    setModality(next);
    setPage(1);
    syncUrl({ modality: next, page: 1 });
  }

  const maxBar = Math.max(
    1,
    ...ranked.map((r) =>
      sort === "popular"
        ? r.tokens
        : sort === "price"
          ? 1 / Math.max(r.promptPerM, 1e-12)
          : 1 / Math.max(r.latencyMs ?? 1e9, 1),
    ),
  );

  const tabs: Array<{ id: Sort; label: string; blurb: string }> = [
    {
      id: "popular",
      label: "Popular",
      blurb: `Actividad registrada${windowKey !== "all" ? ` · últimos ${windowKey}` : " · histórico"}`,
    },
    { id: "price", label: "Precio", blurb: "Precio de entrada por cada millón de tokens" },
    {
      id: "latency",
      label: "Latencia",
      blurb: "Tiempo promedio de respuesta medido en Nexus",
    },
  ];

  if (ranked.length === 0) {
    return (
      <div>
        <Toolbar
          tabs={tabs}
          sort={sort}
          setSort={changeSort}
          freeOnly={freeOnly}
          setFreeOnly={changeFree}
          modality={modality}
          setModality={changeModality}
        />
        <p className="rounded-xl border border-dashed border-zinc-200 bg-white px-4 py-10 text-center text-sm text-zinc-500">
          No encontramos modelos para este criterio.{" "}
          <Link href="/chat" className="text-violet-700 hover:underline">
            Probá otro filtro
          </Link>{" "}
          .
        </p>
      </div>
    );
  }

  return (
    <div>
      <Toolbar
        tabs={tabs}
        sort={sort}
        setSort={changeSort}
        freeOnly={freeOnly}
        setFreeOnly={changeFree}
        modality={modality}
        setModality={changeModality}
      />
      <p className="mb-4 text-sm text-zinc-500">{tabs.find((t) => t.id === sort)?.blurb}</p>

      {sort === "popular" && ranked.every((r) => r.tokens === 0) ? (
        <p className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
          Todavía no hay actividad en este período. Mientras tanto, ordenamos por precio.{" "}
          <Link href="/chat" className="font-medium underline">
            Abrí el chat
          </Link>
          .
        </p>
      ) : null}

      <div id="ranking-results" className="scroll-mt-20 overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="grid grid-cols-[2.5rem_1fr_7rem_7rem] gap-3 border-b border-zinc-200 bg-zinc-50/80 px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-zinc-500 md:grid-cols-[2.5rem_1fr_8rem_7rem_7rem_6rem]">
          <span>#</span>
          <span>Modelo</span>
          <span className="hidden md:block">Entrada / 1 M</span>
          <span className="text-right">
            {sort === "latency" ? "Respuesta" : sort === "price" ? "Precio" : "Tokens"}
          </span>
          <span className="text-right">{sort === "popular" ? "Solicitudes" : "Tokens"}</span>
          <span className="hidden text-right md:block">Proveedores</span>
        </div>
        <ol>
          {visible.map((m, i) => {
            const bar =
              sort === "popular"
                ? m.tokens / maxBar
                : sort === "price"
                  ? (1 / Math.max(m.promptPerM, 1e-12)) / maxBar
                  : (1 / Math.max(m.latencyMs ?? 1e9, 1)) / maxBar;
            return (
              <li
                key={m.id}
                className={`grid grid-cols-[2.5rem_1fr_7rem_7rem] items-center gap-3 px-4 py-3 md:grid-cols-[2.5rem_1fr_8rem_7rem_7rem_6rem] ${
                  i ? "border-t border-zinc-100" : ""
                } ${i % 2 ? "bg-zinc-50/40" : ""}`}
              >
                <span className="font-mono text-xs text-zinc-400">{start + i + 1}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/models/${m.id}`}
                      className="font-mono text-sm text-violet-700 hover:underline"
                    >
                      {m.id}
                    </Link>
                    {m.vision ? (
                      <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-violet-800">
                        imágenes
                      </span>
                    ) : null}
                    {m.free ? (
                      <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-800">
                        gratis
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1.5 h-1 max-w-xs overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-full rounded-full bg-violet-500/50"
                      style={{ width: `${Math.max(bar > 0 ? 4 : 0, bar * 100)}%` }}
                    />
                  </div>
                </div>
                <span className="hidden tabular-nums text-sm text-zinc-500 md:block">
                  {m.free ? "Gratis" : formatUsd(m.promptPerM, 2)}
                </span>
                <span className="text-right tabular-nums text-sm text-zinc-600">
                  {sort === "latency"
                    ? m.latencyMs != null
                      ? `${m.latencyMs} ms${m.measured ? "" : "*"}`
                      : "—"
                    : sort === "price"
                      ? m.free
                        ? "Gratis"
                        : formatUsd(m.promptPerM, 2)
                      : m.tokens.toLocaleString()}
                </span>
                <span className="text-right tabular-nums text-sm text-zinc-500">
                  {sort === "popular" ? m.requests.toLocaleString() : m.tokens.toLocaleString()}
                </span>
                <span className="hidden truncate text-right font-mono text-[10px] text-zinc-400 md:block">
                  {m.providers?.join(", ") || "—"}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-500">
        <span>
          {ranked.length
            ? `${start + 1}–${Math.min(start + PAGE_SIZE, ranked.length)} de ${ranked.length}`
            : "0 resultados"}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => goToPage(currentPage - 1)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="min-w-20 text-center tabular-nums">
            {currentPage} / {pageCount}
          </span>
          <button
            type="button"
            disabled={currentPage >= pageCount}
            onClick={() => goToPage(currentPage + 1)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      </div>
      {sort === "latency" ? (
        <p className="mt-2 text-xs text-zinc-500">
          * Estimación del catálogo hasta contar con suficientes mediciones propias.
        </p>
      ) : null}
    </div>
  );
}

function Toolbar({
  tabs,
  sort,
  setSort,
  freeOnly,
  setFreeOnly,
  modality,
  setModality,
}: {
  tabs: Array<{ id: Sort; label: string }>;
  sort: Sort;
  setSort: (s: Sort) => void;
  freeOnly: boolean;
  setFreeOnly: (v: boolean) => void;
  modality: Modality;
  setModality: (m: Modality) => void;
}) {
  const modes: Array<{ id: Modality; label: string }> = [
    { id: "all", label: "Todos" },
    { id: "text", label: "Texto" },
    { id: "vision", label: "Imágenes" },
  ];
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-1 rounded-xl border border-zinc-200 bg-white p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSort(t.id)}
            className={`rounded-lg px-4 py-2 text-sm transition-colors ${
              sort === t.id ? "bg-violet-50 text-zinc-900" : "text-zinc-500 hover:text-zinc-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-zinc-200 bg-white p-0.5">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setModality(m.id)}
              className={`rounded-md px-2.5 py-1 text-xs ${
                modality === m.id ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-600">
          <input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} />
          Solo gratuitos
        </label>
      </div>
    </div>
  );
}
