"use client";

import { AppPageHeader } from "@/components/layout/app-page-header";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRemoteData } from "@/lib/use-remote-data";

type Status = {
  appUrl: string;
  webhookUrl: string;
  gatewayUrl: string | null;
  database: { label: string; wired: boolean; hint: string; env: string[] };
  auth: { label: string; wired: boolean; hint: string; env: string[] };
  stripe: { label: string; wired: boolean; webhook: boolean; hint: string; env: string[] };
  redis: { label: string; wired: boolean; hint: string; env: string[] };
  providers: Array<{ id: string; label: string; env: string; wired: boolean }>;
  search?: Array<{ id: string; label: string; wired: boolean }>;
  manualCredits: boolean;
};

type ProbeMap = Record<string, { ok: boolean; detail: string }>;

function Dot({ on }: { on: boolean }) {
  return (
    <span className={`inline-block size-2 rounded-full ${on ? "bg-emerald-400" : "bg-zinc-600"}`} />
  );
}

export default function ConnectionsPage() {
  const [status, reload] = useRemoteData<Status>("/api/internal/connections");
  const [probes, setProbes] = useState<ProbeMap | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (!status) return <p className="text-sm text-zinc-500">Cargando conexiones…</p>;

  const blocks = [status.database, status.auth, status.stripe, status.redis];

  return (
    <div>
      <AppPageHeader title="Conexiones">
        Cableá cada integración en <code>.env.local</code>. Nada se inventa: si está verde, el env existe. Los secretos no se muestran.
      </AppPageHeader>

      <div className="mb-8 grid gap-3">
        {blocks.map((b) => (
          <div key={b.label} className="rounded-xl border border-white/10 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-medium">
                <Dot on={b.wired} /> {b.label}
              </div>
              <span className="font-mono text-xs text-zinc-500">{b.env.join(" · ")}</span>
            </div>
            <p className="mt-2 text-sm text-zinc-500">{b.hint}</p>
          </div>
        ))}
      </div>

      <h2 className="mb-3 text-lg font-medium">Laboratorios</h2>
      <div className="mb-8 grid gap-2 md:grid-cols-2">
        {status.providers.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm">
            <span className="flex items-center gap-2">
              <Dot on={p.wired} /> {p.label}
            </span>
            <span className="text-right">
              <span className="font-mono text-xs text-zinc-500">{p.env}</span>
              {probes?.[p.id] ? (
                <div className="text-[11px] text-zinc-500">{probes[p.id].detail}</div>
              ) : null}
            </span>
          </div>
        ))}
      </div>

      {status.search?.length ? (
        <>
          <h2 className="mb-3 text-lg font-medium">Búsqueda web</h2>
          <div className="mb-8 grid gap-2 md:grid-cols-2">
            {status.search.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <Dot on={p.wired} /> {p.label}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <div className="mb-8 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm">
        <div className="font-medium text-amber-200">Webhook Stripe</div>
        <p className="mt-1 font-mono text-xs text-zinc-400">{status.webhookUrl}</p>
        <p className="mt-2 text-zinc-500">
          En el dashboard de Stripe → Webhooks → este URL. Evento:{" "}
          <code>checkout.session.completed</code>.
        </p>
        {status.gatewayUrl ? (
          <p className="mt-2 text-zinc-500">Gateway data plane: {status.gatewayUrl}</p>
        ) : (
          <p className="mt-2 text-zinc-500">
            Data plane embebido en Next. Para separarlo: <code>GATEWAY_URL</code> +{" "}
            <code>npm run dev:gateway</code>.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={async () => {
            setMsg(null);
            const res = await fetch("/api/internal/connections", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "probe" }),
            });
            const json = await res.json();
            setProbes(json.data ?? null);
            setMsg(json.data ? "Ping a labs y Stripe listo" : json.error);
          }}
        >
          Probar cables
        </Button>
        <Button
          onClick={async () => {
            setMsg(null);
            const res = await fetch("/api/internal/connections", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "sync-catalog" }),
            });
            const json = await res.json();
            setMsg(json.data ? `Catálogo: ${json.data.count} modelos` : json.error);
            reload();
          }}
        >
          Sync catálogo (todos los labs)
        </Button>
        {status.manualCredits ? (
          <Button
            variant="outline"
            onClick={async () => {
              const res = await fetch("/api/internal/credits/grant", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ usd: 10 }),
              });
              const json = await res.json();
              setMsg(json.ok ? "Se acreditaron $10 en tu wallet Nexus" : json.error);
            }}
          >
            Cargar $10 (wallet)
          </Button>
        ) : null}
      </div>
      {msg ? <p className="mt-4 text-sm text-amber-300">{msg}</p> : null}
    </div>
  );
}
