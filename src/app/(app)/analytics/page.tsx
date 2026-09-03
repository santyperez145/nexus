"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 md:text-[2rem]">
            Analytics
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
            Uso real de generaciones (chat + media). Ventana {data.window_days}d · sin tracción inventada.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-zinc-200 p-1">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setDays(r.days)}
              className={`rounded-md px-3 py-1 text-xs ${
                days === r.days ? "bg-amber-400/20 text-zinc-700" : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-amber-400/[0.07] to-transparent p-5">
          <div className="text-[10px] uppercase tracking-[0.14em] text-amber-500/80">Insight {days}d</div>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 md:text-4xl">
            {t.requests.toLocaleString()}{" "}
            <span className="text-lg font-medium text-zinc-500">requests</span>
          </div>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-400">
            {formatUsd(t.cost)} · {t.tokens.toLocaleString()} tokens
            {t.avg_latency_ms != null ? ` · ${t.avg_latency_ms} ms avg` : ""}
            {t.requests === 0
              ? " — todavía vacío. Corré Chat o Studio para poblar el ledger."
              : "."}
          </p>
          {t.requests === 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/chat"
                className="rounded-md bg-amber-500/20 px-3 py-1.5 text-sm text-zinc-700 hover:bg-amber-500/30"
              >
                Abrir Chat
              </Link>
              <Link href="/studio" className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-900">
                Studio
              </Link>
            </div>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              k: "Error rate",
              v: `${Math.round((t.error_rate ?? 0) * 100)}%`,
              hint: `${t.errors ?? 0} errs`,
            },
            {
              k: "Local echo",
              v: `${Math.round((t.local_pct ?? 0) * 100)}%`,
              hint: "sin lab key",
            },
            {
              k: "BYOK",
              v: `${Math.round((t.byok_pct ?? 0) * 100)}%`,
              hint: "fee 5% lista",
            },
            {
              k: "Latencia",
              v: t.avg_latency_ms != null ? `${t.avg_latency_ms}` : "—",
              hint: "ms avg",
            },
          ].map((c) => (
            <div key={c.k} className="rounded-xl border border-zinc-200 bg-white px-3 py-3">
              <div className="text-[10px] uppercase tracking-wide text-zinc-600">{c.k}</div>
              <div className="mt-1 font-mono text-lg tabular-nums text-zinc-900">{c.v}</div>
              <div className="text-[11px] text-zinc-600">{c.hint}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        {[
          { k: "Requests", v: String(t.requests) },
          { k: "Tokens", v: t.tokens.toLocaleString() },
          { k: "Costo", v: formatUsd(t.cost) },
        ].map((c) => (
          <div key={c.k} className="rounded-xl border border-zinc-200 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wide text-zinc-600">{c.k}</div>
            <div className="mt-0.5 text-xl font-semibold tabular-nums text-zinc-900">
              {c.v}
            </div>
          </div>
        ))}
      </div>

      <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-zinc-800">
            Serie diaria
          </h2>
          <div className="flex gap-1">
            {(["requests", "tokens", "cost"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetric(m)}
                className={`rounded px-2 py-0.5 text-[11px] uppercase tracking-wide ${
                  metric === m ? "bg-violet-50 text-zinc-700" : "text-zinc-600 hover:text-zinc-400"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="flex h-28 items-end gap-px">
          {series.map((v, i) => (
            <div
              key={data.by_day?.[i]?.day ?? i}
              title={`${data.by_day?.[i]?.day ?? ""}: ${metric === "cost" ? formatUsd(v) : v.toLocaleString()}`}
              className="min-w-0 flex-1 rounded-t bg-amber-400/45 transition-[height]"
              style={{ height: `${Math.max(v > 0 ? 8 : 2, (v / maxDay) * 100)}%` }}
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
          <h2 className="mb-3 text-sm font-medium text-zinc-600">Por provider</h2>
          <div className="grid gap-2">
            {(data.by_provider ?? [])
              .slice()
              .sort((a, b) => b.requests - a.requests)
              .map((row) => (
                <div
                  key={row.provider}
                  className="flex justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                >
                  <span className="font-mono text-zinc-800">{row.provider}</span>
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
          <h2 className="mb-3 text-sm font-medium text-zinc-600">Por app (X-Title)</h2>
          <div className="grid gap-2">
            {(data.by_app ?? []).map((row) => (
              <div
                key={row.app}
                className="flex justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              >
                <span className="truncate text-zinc-800">{row.app}</span>
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

      <h2 className="mb-3 text-sm font-medium text-zinc-600">Por modelo</h2>
      <div className="mb-8 grid gap-2">
        {data.by_model
          .slice()
          .sort((a, b) => b.tokens - a.tokens)
          .map((row) => (
            <div key={row.model} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm">
              <div className="mb-1.5 flex justify-between gap-2">
                <Link href={`/models/${row.model}`} className="font-mono text-violet-700 hover:underline">
                  {row.model}
                </Link>
                <span className="shrink-0 text-zinc-500">
                  {row.requests} · {row.tokens.toLocaleString()} · {formatUsd(row.cost)}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-violet-500"
                  style={{ width: `${Math.max(4, (row.tokens / maxModelTok) * 100)}%` }}
                />
              </div>
            </div>
          ))}
      </div>

      {data.by_key?.length ? (
        <>
          <h2 className="mb-3 text-sm font-medium text-zinc-600">Por API key</h2>
          <div className="mb-8 grid gap-2">
            {data.by_key.map((row) => (
              <div
                key={row.key}
                className="flex justify-between rounded-lg border border-zinc-200 px-3 py-2 font-mono text-xs text-zinc-400"
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
            <h2 className="text-sm font-medium text-zinc-600">Reciente</h2>
            <Link href="/activity" className="text-xs text-violet-700 hover:underline">
              Activity →
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border border-zinc-200">
            {data.recent.map((r, i) => (
              <Link
                key={r.id}
                href={`/activity/${r.id}`}
                className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-zinc-50 ${
                  i ? "border-t border-zinc-100" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-violet-700">{r.model}</div>
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
