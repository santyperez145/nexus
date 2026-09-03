"use client";

import { useMemo, useState } from "react";
import { formatUsd } from "@/lib/money";
import { useRemoteData } from "@/lib/use-remote-data";

type Analytics = {
  totals: { requests: number; tokens: number; cost: number };
  by_model: Array<{ model: string; tokens: number; cost: number; requests: number }>;
  by_provider: Array<{ provider: string; tokens: number; cost: number; requests: number }>;
  window_days: number;
};

const RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [data] = useRemoteData<Analytics>(`/api/v1/analytics?days=${days}`);

  const maxModelTok = useMemo(
    () => Math.max(1, ...(data?.by_model.map((r) => r.tokens) ?? [1])),
    [data],
  );

  if (!data) return <p className="text-sm text-zinc-500">Cargando analytics…</p>;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-2 text-2xl font-semibold">Analytics</h1>
          <p className="text-sm text-zinc-500">
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
      <div className="mb-8 grid gap-6 md:grid-cols-3">
        <div>
          <div className="text-xs text-zinc-500">Requests</div>
          <div className="text-2xl font-semibold">{data.totals.requests}</div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">Tokens</div>
          <div className="text-2xl font-semibold">{data.totals.tokens.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">Costo</div>
          <div className="text-2xl font-semibold">{formatUsd(data.totals.cost)}</div>
        </div>
      </div>
      <h2 className="mb-3 text-sm font-medium text-zinc-300">Por provider</h2>
      <div className="mb-8 grid gap-2">
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
                {row.requests} req · {row.tokens.toLocaleString()} tok · {formatUsd(row.cost)}
              </span>
            </div>
          ))}
        {!data.by_provider?.length ? (
          <p className="text-sm text-zinc-600">Sin generaciones en esta ventana.</p>
        ) : null}
      </div>
      <h2 className="mb-3 text-sm font-medium text-zinc-300">Por modelo</h2>
      <div className="grid gap-2">
        {data.by_model
          .slice()
          .sort((a, b) => b.tokens - a.tokens)
          .map((row) => (
            <div key={row.model} className="rounded-lg border border-white/10 px-3 py-2 text-sm">
              <div className="mb-1.5 flex justify-between gap-2">
                <span className="font-mono text-amber-400/80">{row.model}</span>
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
    </div>
  );
}
