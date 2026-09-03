"use client";

import { formatUsd } from "@/lib/money";
import { useRemoteData } from "@/lib/use-remote-data";

type Analytics = {
  totals: { requests: number; tokens: number; cost: number };
  by_model: Array<{ model: string; tokens: number; cost: number; requests: number }>;
};

export default function AnalyticsPage() {
  const [data] = useRemoteData<Analytics>("/api/v1/analytics");

  if (!data) return <p className="text-sm text-zinc-500">Cargando analytics…</p>;

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Analytics</h1>
      <p className="mb-8 text-sm text-zinc-500">Uso de tus generaciones en esta cuenta. Sin tracción inventada.</p>
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
      <div className="grid gap-2">
        {data.by_model
          .slice()
          .sort((a, b) => b.tokens - a.tokens)
          .map((row) => (
            <div key={row.model} className="flex justify-between rounded-lg border border-white/10 px-3 py-2 text-sm">
              <span className="font-mono text-amber-400/80">{row.model}</span>
              <span className="text-zinc-500">
                {row.requests} req · {row.tokens.toLocaleString()} tok · {formatUsd(row.cost)}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
