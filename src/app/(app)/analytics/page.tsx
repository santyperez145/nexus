"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Sparkline } from "@/components/charts/sparkline";
import { formatUsd } from "@/lib/money";
import { useRemoteData } from "@/lib/use-remote-data";

type Analytics = {
  totals: {
    requests: number;
    tokens: number;
    cost: number;
    errors?: number;
    error_rate?: number;
    avg_latency_ms?: number | null;
    local_pct?: number;
    byok_pct?: number;
  };
  by_day?: Array<{ day: string; requests: number; tokens: number; cost: number }>;
  by_model: Array<{ model: string; tokens: number; cost: number; requests: number }>;
  by_provider: Array<{ provider: string; tokens: number; cost: number; requests: number }>;
  by_key?: Array<{ key: string; tokens: number; cost: number; requests: number }>;
  by_app?: Array<{ app: string; tokens: number; cost: number; requests: number }>;
  recent?: Array<{
    id: string;
    model: string;
    provider: string;
    tokens: number;
    cost: number;
    latency_ms: number | null;
    error: string | null;
    created_at: string;
  }>;
  window_days: number;
};

const RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState<"requests" | "tokens" | "cost">("requests");
  const [data] = useRemoteData<Analytics>(`/api/v1/analytics?days=${days}`);

  const maxModelTok = useMemo(
    () => Math.max(1, ...(data?.by_model.map((r) => r.tokens) ?? [1])),
    [data],
  );
  const series = useMemo(() => (data?.by_day ?? []).map((d) => d[metric]), [data, metric]);
  const maxDay = Math.max(1, ...series);

  if (!data) return <p className="text-sm text-zinc-500">Cargando analytics…</p>;

  const t = data.totals;

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight text-zinc-50 md:text-[2rem]">
            Analytics
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
            Uso real de generaciones (chat + media). Ventana {data.window_days}d · sin tracción inventada.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-white/10 p-1">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setDays(r.days)}
              className={`rounded-md px-3 py-1 text-xs ${
                days === r.days ? "bg-amber-400/20 text-amber-200" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { k: "Requests", v: String(t.requests) },
          { k: "Tokens", v: t.tokens.toLocaleString() },
          { k: "Costo", v: formatUsd(t.cost) },
          {
            k: "Latencia avg",
            v: t.avg_latency_ms != null ? `${t.avg_latency_ms} ms` : "—",
          },
          {
            k: "Error rate",
            v: `${Math.round((t.error_rate ?? 0) * 100)}%`,
          },
          {
            k: "Local / BYOK",
            v: `${Math.round((t.local_pct ?? 0) * 100)}% · ${Math.round((t.byok_pct ?? 0) * 100)}%`,
          },
        ].map((c) => (
          <div key={c.k} className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">{c.k}</div>
            <div className="mt-1 font-[family-name:var(--font-syne)] text-xl font-semibold tabular-nums">
              {c.v}
            </div>
          </div>
        ))}
      </div>

      <section className="mb-8 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-zinc-300">Serie diaria</h2>
          <div className="flex gap-1">
            {(["requests", "tokens", "cost"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetric(m)}
                className={`rounded px-2 py-0.5 text-[11px] uppercase tracking-wide ${
                  metric === m ? "bg-amber-400/15 text-amber-200" : "text-zinc-600 hover:text-zinc-400"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <Sparkline values={series} className="mb-4 h-14 w-full" />
        <div className="flex h-24 items-end gap-px">
          {series.map((v, i) => (
            <div
              key={data.by_day?.[i]?.day ?? i}
              title={`${data.by_day?.[i]?.day ?? ""}: ${metric === "cost" ? formatUsd(v) : v.toLocaleString()}`}
              className="min-w-0 flex-1 rounded-t bg-amber-400/40"
              style={{ height: `${Math.max(v > 0 ? 6 : 2, (v / maxDay) * 100)}%` }}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-zinc-600">
          <span>{data.by_day?.[0]?.day ?? ""}</span>
          <span>{data.by_day?.[data.by_day.length - 1]?.day ?? ""}</span>
        </div>
      </section>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-medium text-zinc-300">Por provider</h2>
          <div className="grid gap-2">
            {(data.by_provider ?? [])
              .slice()
              .sort((a, b) => b.requests - a.requests)
              .map((row) => (
                <div
                  key={row.provider}
                  className="flex justify-between rounded-lg border border-white/10 px-3 py-2 text-sm"
                >
                  <span className="font-mono text-zinc-200">{row.provider}</span>
                  <span className="text-zinc-500">
                    {row.requests} · {row.tokens.toLocaleString()} · {formatUsd(row.cost)}
                  </span>
                </div>
              ))}
            {!data.by_provider?.length ? (
              <p className="text-sm text-zinc-600">Sin generaciones en esta ventana.</p>
            ) : null}
          </div>
        </section>
        <section>
          <h2 className="mb-3 text-sm font-medium text-zinc-300">Por app (X-Title)</h2>
          <div className="grid gap-2">
            {(data.by_app ?? []).map((row) => (
              <div
                key={row.app}
                className="flex justify-between rounded-lg border border-white/10 px-3 py-2 text-sm"
              >
                <span className="truncate text-zinc-200">{row.app}</span>
                <span className="shrink-0 text-zinc-500">
                  {row.requests} · {formatUsd(row.cost)}
                </span>
              </div>
            ))}
            {!data.by_app?.length ? (
              <p className="text-sm text-zinc-600">Sin atribución aún.</p>
            ) : null}
          </div>
        </section>
      </div>

      <h2 className="mb-3 text-sm font-medium text-zinc-300">Por modelo</h2>
      <div className="mb-8 grid gap-2">
        {data.by_model
          .slice()
          .sort((a, b) => b.tokens - a.tokens)
          .map((row) => (
            <div key={row.model} className="rounded-lg border border-white/10 px-3 py-2 text-sm">
              <div className="mb-1.5 flex justify-between gap-2">
                <Link href={`/models/${row.model}`} className="font-mono text-amber-400/80 hover:underline">
                  {row.model}
                </Link>
                <span className="shrink-0 text-zinc-500">
                  {row.requests} · {row.tokens.toLocaleString()} · {formatUsd(row.cost)}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-amber-400/50"
                  style={{ width: `${Math.max(4, (row.tokens / maxModelTok) * 100)}%` }}
                />
              </div>
            </div>
          ))}
      </div>

      {data.by_key?.length ? (
        <>
          <h2 className="mb-3 text-sm font-medium text-zinc-300">Por API key</h2>
          <div className="mb-8 grid gap-2">
            {data.by_key.map((row) => (
              <div
                key={row.key}
                className="flex justify-between rounded-lg border border-white/10 px-3 py-2 font-mono text-xs text-zinc-400"
              >
                <span className="truncate">{row.key}</span>
                <span>
                  {row.requests} · {formatUsd(row.cost)}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {data.recent?.length ? (
        <>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-zinc-300">Reciente</h2>
            <Link href="/activity" className="text-xs text-amber-400 hover:underline">
              Activity →
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border border-white/10">
            {data.recent.map((r, i) => (
              <Link
                key={r.id}
                href={`/activity/${r.id}`}
                className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-white/[0.03] ${
                  i ? "border-t border-white/5" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-amber-400/85">{r.model}</div>
                  <div className="text-xs text-zinc-600">
                    {r.provider}
                    {r.error ? " · err" : ""}
                    {r.latency_ms != null ? ` · ${r.latency_ms} ms` : ""}
                  </div>
                </div>
                <div className="text-right text-xs text-zinc-500">
                  {r.tokens.toLocaleString()} tok · {formatUsd(r.cost)}
                </div>
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
