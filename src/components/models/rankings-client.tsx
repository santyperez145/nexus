"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatUsd } from "@/lib/money";

export type RankingRow = {
  id: string;
  promptPerM: number;
  free: boolean;
  tokens: number;
  requests: number;
  latencyMs: number | null;
};

type Sort = "popular" | "price" | "latency";

export function RankingsClient({ rows }: { rows: RankingRow[] }) {
  const [sort, setSort] = useState<Sort>("popular");
  const ranked = useMemo(() => {
    const list = rows.slice();
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
    return list.slice(0, 80);
  }, [rows, sort]);

  const maxBar = Math.max(
    1,
    ...ranked.map((r) => (sort === "popular" ? r.tokens : sort === "price" ? 1 / Math.max(r.promptPerM, 1e-12) : 1 / Math.max(r.latencyMs ?? 1e9, 1))),
  );

  const tabs: Array<{ id: Sort; label: string; blurb: string }> = [
    { id: "popular", label: "Popular", blurb: "Tokens reales en esta instancia" },
    { id: "price", label: "Precio", blurb: "Prompt / 1M del catálogo" },
    { id: "latency", label: "Latencia", blurb: "Min latencyMs de endpoints" },
  ];

  if (ranked.length === 0) {
    return (
      <div>
        <div className="mb-6 flex flex-wrap gap-1 rounded-xl border border-zinc-200 bg-white p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSort(t.id)}
              className={`rounded-lg px-4 py-2 text-sm transition-colors ${
                sort === t.id ? "bg-amber-50 text-amber-900" : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="rounded-xl border border-dashed border-zinc-200 bg-white px-4 py-10 text-center text-sm text-zinc-500">
          Sin filas para este criterio.{" "}
          <Link href="/chat" className="text-amber-700 hover:underline">
            Generá uso en el chat
          </Link>{" "}
          — no inventamos leaderboards.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-1 rounded-xl border border-zinc-200 bg-white p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSort(t.id)}
            className={`rounded-lg px-4 py-2 text-sm transition-colors ${
              sort === t.id ? "bg-amber-50 text-amber-900" : "text-zinc-500 hover:text-zinc-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="mb-4 text-sm text-zinc-500">{tabs.find((t) => t.id === sort)?.blurb}</p>

      {sort === "popular" && ranked.every((r) => r.tokens === 0) ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-900/80">
          Todavía no hay tokens en esta instancia — el orden Popular cae a precio.{" "}
          <Link href="/chat" className="font-medium underline">
            Abrí el chat
          </Link>
          .
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="grid grid-cols-[2.5rem_1fr_7rem_7rem] gap-3 border-b border-zinc-200 bg-zinc-50/80 px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-zinc-500 md:grid-cols-[2.5rem_1fr_8rem_7rem_7rem]">
          <span>#</span>
          <span>Modelo</span>
          <span className="hidden md:block">Prompt / 1M</span>
          <span className="text-right">{sort === "latency" ? "Latency" : sort === "price" ? "Score" : "Tokens"}</span>
          <span className="text-right">{sort === "popular" ? "Requests" : "Tokens"}</span>
        </div>
        <ol>
          {ranked.map((m, i) => {
            const bar =
              sort === "popular"
                ? m.tokens / maxBar
                : sort === "price"
                  ? (1 / Math.max(m.promptPerM, 1e-12)) / maxBar
                  : (1 / Math.max(m.latencyMs ?? 1e9, 1)) / maxBar;
            return (
              <li
                key={m.id}
                className={`grid grid-cols-[2.5rem_1fr_7rem_7rem] items-center gap-3 px-4 py-3 md:grid-cols-[2.5rem_1fr_8rem_7rem_7rem] ${
                  i ? "border-t border-zinc-100" : ""
                } ${i % 2 ? "bg-zinc-50/40" : ""}`}
              >
                <span className="font-mono text-xs text-zinc-400">{i + 1}</span>
                <div className="min-w-0">
                  <Link href={`/models/${m.id}`} className="font-mono text-sm text-amber-700 hover:underline">
                    {m.id}
                  </Link>
                  <div className="mt-1.5 h-1 max-w-xs overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-full rounded-full bg-amber-500/50"
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
                      ? `${m.latencyMs} ms`
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
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
