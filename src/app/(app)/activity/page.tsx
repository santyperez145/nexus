"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUsd } from "@/lib/money";
import { useRemoteData } from "@/lib/use-remote-data";

type Row = {
  id: string;
  model: string;
  provider_name: string;
  generation_time: number | null;
  tokens_prompt: number;
  tokens_completion: number;
  total_cost: number;
  created_at: number;
  is_byok: boolean;
  error: string | null;
};

function shortId(id: string) {
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function fmtWhen(ts: number) {
  return new Intl.DateTimeFormat("es-AR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts * 1000));
}

function relativeWhen(ts: number) {
  const sec = Math.max(1, Math.floor(Date.now() / 1000 - ts));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

export default function ActivityPage() {
  const [model, setModel] = useState("");
  const [provider, setProvider] = useState("");
  const [byok, setByok] = useState<"all" | "1" | "0">("all");
  const [errors, setErrors] = useState(false);
  const [days, setDays] = useState<"0" | "7" | "30">("0");
  const [limit, setLimit] = useState(50);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ limit: String(limit) });
    if (model.trim()) p.set("model", model.trim());
    if (provider.trim()) p.set("provider", provider.trim());
    if (byok !== "all") p.set("byok", byok);
    if (errors) p.set("errors", "1");
    if (days !== "0") p.set("days", days);
    return p.toString();
  }, [model, provider, byok, errors, days, limit]);

  const [rows] = useRemoteData<Row[]>(`/api/v1/generations?${qs}`);
  const list = rows ?? [];
  const tokens = list.reduce((s, r) => s + r.tokens_prompt + r.tokens_completion, 0);
  const cost = list.reduce((s, r) => s + r.total_cost, 0);

  return (
    <div>
      <AppPageHeader
        title="Activity"
        actions={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!list.length}
              onClick={() => {
                const header = [
                  "id",
                  "model",
                  "provider",
                  "tokens_prompt",
                  "tokens_completion",
                  "cost",
                  "latency_ms",
                  "created_at",
                  "is_byok",
                  "error",
                ];
                const lines = list.map((r) =>
                  [
                    r.id,
                    r.model,
                    r.provider_name,
                    r.tokens_prompt,
                    r.tokens_completion,
                    r.total_cost,
                    r.generation_time ?? "",
                    new Date(r.created_at * 1000).toISOString(),
                    r.is_byok ? "1" : "0",
                    JSON.stringify(r.error ?? ""),
                  ].join(","),
                );
                const blob = new Blob([[header.join(","), ...lines].join("\n")], {
                  type: "text/csv;charset=utf-8",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `nexus-activity-${days === "0" ? "all" : days + "d"}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export CSV
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/chat">Nuevo chat</Link>
            </Button>
          </div>
        }
      >
        {list.length} requests · {tokens.toLocaleString()} tokens · {formatUsd(cost)}
        {rows == null ? " · cargando…" : ""}
      </AppPageHeader>

      <div className="mb-4 grid gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 md:grid-cols-[1fr_1fr_auto_auto_auto]">
        <Input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="Filtrar modelo…"
          className="h-9"
        />
        <Input
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          placeholder="Provider…"
          className="h-9"
        />
        <select
          value={byok}
          onChange={(e) => setByok(e.target.value as typeof byok)}
          className="h-9 rounded-md border border-white/10 bg-zinc-950 px-2 text-sm text-zinc-300"
          aria-label="BYOK"
        >
          <option value="all">BYOK: todos</option>
          <option value="1">Solo BYOK</option>
          <option value="0">Sin BYOK</option>
        </select>
        <select
          value={days}
          onChange={(e) => setDays(e.target.value as typeof days)}
          className="h-9 rounded-md border border-white/10 bg-zinc-950 px-2 text-sm text-zinc-300"
          aria-label="Ventana"
        >
          <option value="0">Todo</option>
          <option value="7">7d</option>
          <option value="30">30d</option>
        </select>
        <label className="flex h-9 items-center gap-2 text-xs text-zinc-400">
          <input type="checkbox" checked={errors} onChange={(e) => setErrors(e.target.checked)} />
          Solo errores
        </label>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-white/10 bg-zinc-950/95 text-[11px] uppercase tracking-[0.08em] text-zinc-500 backdrop-blur">
              <tr>
                <th className="px-3 py-2.5 font-medium">Cuando</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">ID</th>
                <th className="px-3 py-2.5 font-medium">Modelo</th>
                <th className="px-3 py-2.5 font-medium">Provider</th>
                <th className="px-3 py-2.5 font-medium text-right">Prompt</th>
                <th className="px-3 py-2.5 font-medium text-right">Out</th>
                <th className="px-3 py-2.5 font-medium text-right">Costo</th>
                <th className="px-3 py-2.5 font-medium text-right">ms</th>
              </tr>
            </thead>
            <tbody>
              {rows != null && list.length === 0 ? (
                <tr>
                  <td className="px-4 py-12 text-center text-zinc-500" colSpan={9}>
                    Sin generaciones.{" "}
                    <Link href="/chat" className="text-amber-400 hover:underline">
                      Abrí el chat
                    </Link>{" "}
                    — no inventamos activity.
                  </td>
                </tr>
              ) : (
                list.map((r, i) => (
                  <tr
                    key={r.id}
                    className={`border-t border-white/5 hover:bg-white/[0.03] ${i % 2 === 1 ? "bg-white/[0.015]" : ""}`}
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-zinc-500" title={fmtWhen(r.created_at)}>
                      {relativeWhen(r.created_at)}
                      <span className="mt-0.5 block text-[10px] text-zinc-600">{fmtWhen(r.created_at)}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                          r.error
                            ? "border-rose-400/30 text-rose-300"
                            : "border-emerald-500/25 text-emerald-300/90"
                        }`}
                      >
                        {r.error ? "err" : "ok"}
                      </span>
                      {r.is_byok ? (
                        <span className="ml-1 text-[10px] uppercase text-zinc-600">byok</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs">
                      <Link href={`/activity/${r.id}`} className="text-amber-400/90 hover:underline" title={r.id}>
                        {shortId(r.id)}
                      </Link>
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2.5 font-mono text-[13px] text-amber-300/80">
                      {r.model}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-400">{r.provider_name}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">
                      {r.tokens_prompt.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">
                      {r.tokens_completion.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">
                      {formatUsd(r.total_cost)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-zinc-500">
                      {r.generation_time ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {rows != null && list.length >= limit && limit < 200 ? (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setLimit((n) => Math.min(200, n + 50))}>
            Cargar más
          </Button>
        </div>
      ) : null}
    </div>
  );
}
