"use client";

import { useRemoteData } from "@/lib/use-remote-data";

type Limits = {
  rpm_limit: number;
  rpm_used: number;
  free_rpd_limit: number;
  free_rpd_used: number;
  free_rpd_note: string;
};

export function RateLimitsCard() {
  const [data] = useRemoteData<Limits>("/api/internal/rate-limits");
  if (!data) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm text-zinc-500">
        Cargando cuotas…
      </div>
    );
  }
  const rpmPct = Math.min(100, (data.rpm_used / Math.max(1, data.rpm_limit)) * 100);
  const rpdPct = Math.min(100, (data.free_rpd_used / Math.max(1, data.free_rpd_limit)) * 100);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Rate limits</div>
      <p className="mt-1 text-xs text-zinc-500">Cuotas reales de esta cuenta · sin SLA inventado.</p>

      <div className="mt-4 space-y-4">
        <div>
          <div className="mb-1 flex justify-between text-xs text-zinc-500">
            <span>RPM (cuenta)</span>
            <span className="tabular-nums">
              {data.rpm_used} / {data.rpm_limit}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
            <div
              className={`h-full rounded-full ${rpmPct >= 90 ? "bg-rose-400/70" : "bg-amber-400/60"}`}
              style={{ width: `${Math.max(rpmPct ? 3 : 0, rpmPct)}%` }}
            />
          </div>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs text-zinc-500">
            <span>Free RPD</span>
            <span className="tabular-nums">
              {data.free_rpd_used} / {data.free_rpd_limit}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
            <div
              className={`h-full rounded-full ${rpdPct >= 90 ? "bg-rose-400/70" : "bg-emerald-400/50"}`}
              style={{ width: `${Math.max(rpdPct ? 3 : 0, rpdPct)}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-600">{data.free_rpd_note}</p>
        </div>
      </div>
    </div>
  );
}
