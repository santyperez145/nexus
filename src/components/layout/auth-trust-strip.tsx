"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Status = {
  models?: number;
  wired_labs?: number;
  configured_labs?: number;
  verified_labs?: number;
  mode?: string;
  ok?: boolean;
  commerce_ok?: boolean;
};

/** Live trust strip for auth screens — no invented uptime. */
export function AuthTrustStrip() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/v1/status", { signal: ac.signal })
      .then((r) => r.json())
      .then((j: Status) => setStatus(j))
      .catch(() => undefined);
    return () => ac.abort();
  }, []);

  const models = status?.models ?? "…";
  const mode =
    status?.mode === "live"
      ? "Disponible"
      : status?.mode === "degraded"
        ? "En revisión"
      : status?.mode === "unconfigured"
        ? "Pendiente"
        : "…";
  const labs = status?.verified_labs ?? status?.wired_labs ?? "…";

  return (
    <div className="mt-8 grid grid-cols-3 gap-2">
      {[
        { k: "Modelos", v: String(models), href: "/models" },
        { k: "Proveedores verificados", v: String(labs), href: "/providers" },
        { k: "Servicio", v: mode, href: "/status" },
      ].map((s) => (
        <Link
          key={s.k}
          href={s.href}
          className="rounded-xl border border-zinc-200/80 bg-white/60 px-3 py-2.5 transition-colors hover:border-zinc-300"
        >
          <div className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">{s.k}</div>
          <div className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-900">
            {s.v}
          </div>
        </Link>
      ))}
    </div>
  );
}
