"use client";

import Link from "next/link";
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
  stripe: {
    label: string;
    wired: boolean;
    webhook: boolean;
    plans: boolean;
    portal: boolean;
    ready: boolean;
    mode: "test" | "live" | "unconfigured" | "unknown";
    hint: string;
    env: string[];
  };
  redis: { label: string; wired: boolean; hint: string; env: string[] };
  providers: Array<{ id: string; label: string; env: string; wired: boolean }>;
  search?: Array<{ id: string; label: string; wired: boolean }>;
  manualCredits: boolean;
  platformAdmin: boolean;
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

  const blocks = [
    { ...status.database, ready: status.database.wired },
    { ...status.auth, ready: status.auth.wired },
    status.stripe,
    { ...status.redis, ready: status.redis.wired },
  ];
  const wiredLabs = status.providers.filter((p) => p.wired).length;
  const mode = wiredLabs > 0 ? "live hops" : "unconfigured";

  return (
    <div>
      <AppPageHeader title="Conexiones">
        Cableá cada integración en <code>.env.local</code>. Nada se inventa: si está verde, el env
        existe. Los secretos no se muestran.
      </AppPageHeader>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">Mode</div>
          <div className="mt-1 font-mono text-sm text-zinc-700">{mode}</div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">Labs wired</div>
          <div className="mt-1 font-mono text-sm text-zinc-800">
            {wiredLabs}/{status.providers.length}
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">Atajos</div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            <Link href="/settings/byok" className="text-violet-700 hover:underline">
              BYOK
            </Link>
            <Link href="/status" className="text-violet-700 hover:underline">
              Status
            </Link>
            <Link href="/api/v1/status" className="text-violet-700 hover:underline">
              JSON
            </Link>
          </div>
        </div>
      </div>

      <div className="mb-8 grid gap-3">
        {blocks.map((b) => (
          <div key={b.label} className="rounded-xl border border-zinc-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-medium">
                <Dot on={b.ready} /> {b.label}
              </div>
              <span className="font-mono text-xs text-zinc-500">{b.env.join(" · ")}</span>
            </div>
            <p className="mt-2 text-sm text-zinc-500">{b.hint}</p>
            {b.label.startsWith("Stripe") ? (
              <p className="mt-1 text-xs text-zinc-500">
                Modo: {status.stripe.mode} · webhook {status.stripe.webhook ? "sí" : "no"} ·
                planes {status.stripe.plans ? "sí" : "no"} · portal {status.stripe.portal ? "sí" : "no"}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <h2 className="mb-3 text-lg font-medium">Laboratorios</h2>
      <p className="mb-3 text-xs text-zinc-500">
        Sin key de plataforma: usá{" "}
        <Link href="/settings/byok" className="text-violet-700 hover:underline">
          BYOK
        </Link>{" "}
        o agregá una credencial BYOK.
      </p>
      <div className="mb-8 grid gap-2 md:grid-cols-2">
        {status.providers.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm">
            <span className="flex items-center gap-2">
              <Dot on={p.wired} />{" "}
              <Link href={`/providers/${p.id}`} className="hover:text-zinc-950">
                {p.label}
              </Link>
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
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <Dot on={p.wired} /> {p.label}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <div className="mb-8 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm">
        <div className="font-medium text-zinc-700">Webhook Stripe</div>
        <p className="mt-1 font-mono text-xs text-zinc-400">{status.webhookUrl}</p>
        <p className="mt-2 text-zinc-500">
          Eventos: <code>checkout.session.completed</code>, <code>checkout.session.async_payment_succeeded</code>,{" "}
          <code>customer.subscription.*</code>, <code>invoice.paid</code>,{" "}
          <code>invoice.payment_failed</code>, <code>payment_intent.succeeded</code>, refunds y disputas.
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

      {status.platformAdmin ? <div className="flex flex-wrap gap-2">
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
      </div> : (
        <p className="text-sm text-zinc-500">Los probes y el sync global están reservados al platform admin.</p>
      )}
      {msg ? <p className="mt-4 text-sm text-zinc-950">{msg}</p> : null}
    </div>
  );
}
