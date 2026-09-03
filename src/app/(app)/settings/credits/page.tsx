"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { CREDIT_PACKS } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUsd } from "@/lib/money";
import { useRemoteData } from "@/lib/use-remote-data";

type Credits = {
  remaining: number;
  total_credits: number;
  total_usage: number;
  manual_credits?: boolean;
  ledger: Array<{ id: string; type: string; amount: number; note: string | null; created_at: string }>;
};

function CreditsInner() {
  const params = useSearchParams();
  const checkoutOk = params.get("ok") === "1";
  const canceled = params.get("canceled") === "1";
  const [credits, reload] = useRemoteData<Credits>("/api/v1/credits");
  const [msg, setMsg] = useState<string | null>(
    canceled ? "Checkout cancelado." : checkoutOk ? "Confirmando pago con Stripe…" : null,
  );
  const [threshold, setThreshold] = useState("5");
  const [amount, setAmount] = useState("25");
  const baseline = useRef<number | null>(null);
  const polls = useRef(0);

  useEffect(() => {
    if (!checkoutOk) return;
    if (credits && baseline.current == null) baseline.current = credits.remaining;
    const timer = window.setInterval(() => {
      polls.current += 1;
      reload();
      if (polls.current >= 12) {
        window.clearInterval(timer);
        setMsg("Si el saldo no cambió, el webhook puede demorar unos segundos. Refrescá.");
        window.history.replaceState({}, "", "/settings/credits");
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [checkoutOk, reload, credits]);

  useEffect(() => {
    if (!checkoutOk || credits == null || baseline.current == null) return;
    if (credits.remaining > baseline.current) {
      setMsg(`Créditos acreditados. Saldo ${formatUsd(credits.remaining, 2)}.`);
      window.history.replaceState({}, "", "/settings/credits");
    }
  }, [checkoutOk, credits]);

  async function buy(packId: string) {
    setMsg(null);
    const res = await fetch("/api/internal/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packId }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.assign(data.url);
      return;
    }
    setMsg(data.error ?? "No se pudo iniciar el checkout");
    reload();
  }

  async function saveTopup() {
    const res = await fetch("/api/internal/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        autoTopupEnabled: true,
        autoTopupThresholdUsd: Number(threshold),
        autoTopupAmountUsd: Number(amount),
      }),
    });
    const json = await res.json();
    setMsg(json.ok ? "Auto top-up guardado" : json.error);
  }

  return (
    <div>
      <AppPageHeader title="Credits">
        Pass-through del precio del laboratorio. Fee 4.9% al cargar con Stripe.
      </AppPageHeader>
      {credits ? (
        <p className="mb-6 text-sm text-amber-300">
          Saldo {formatUsd(credits.remaining, 2)} · cargado {formatUsd(credits.total_credits, 2)} · usado{" "}
          {formatUsd(credits.total_usage, 2)}
        </p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-3">
        {CREDIT_PACKS.map((p) => (
          <div key={p.id} className="rounded-xl border border-white/10 p-4">
            <div className="text-2xl font-semibold">{p.label}</div>
            <p className="mb-4 text-sm text-zinc-500">Saldo de inferencia + 4.9%</p>
            <Button onClick={() => void buy(p.id)}>Comprar</Button>
          </div>
        ))}
      </div>
      {credits?.manual_credits ? (
        <p className="mt-4 text-sm text-zinc-500">
          Stripe no es obligatorio en este entorno.{" "}
          <button
            type="button"
            className="text-amber-400 hover:underline"
            onClick={async () => {
              const res = await fetch("/api/internal/credits/grant", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ usd: 10 }),
              });
              const json = await res.json();
              setMsg(json.ok ? "Se acreditaron $10 (wallet manual)" : json.error);
              reload();
            }}
          >
            Cargar $10 sin Stripe
          </button>
        </p>
      ) : null}
      <h2 className="mt-10 mb-3 text-lg font-medium">Auto top-up</h2>
      <p className="mb-3 max-w-xl text-sm text-zinc-500">
        Con wallet manual acredita saldo al pasar el umbral. En prod (Stripe) cobra la tarjeta
        guardada del customer tras un checkout con{" "}
        <code className="text-zinc-300">setup_future_usage</code>.
      </p>
      <div className="grid max-w-xl gap-2 md:grid-cols-3">
        <Input value={threshold} onChange={(e) => setThreshold(e.target.value)} aria-label="Umbral USD" />
        <Input value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Monto USD" />
        <Button variant="outline" onClick={() => void saveTopup()}>
          Activar
        </Button>
      </div>
      {msg ? <p className="mt-4 text-sm text-amber-300">{msg}</p> : null}
      {credits?.ledger?.length ? (
        <>
          <h2 className="mt-10 mb-3 text-lg font-medium">Ledger</h2>
          <div className="grid gap-2">
            {credits.ledger.map((l) => (
              <div
                key={l.id}
                className="flex justify-between rounded-lg border border-white/10 px-3 py-2 text-sm"
              >
                <span>
                  {l.type} {l.note ? <span className="text-zinc-500">· {l.note}</span> : null}
                </span>
                <span className={l.amount < 0 ? "text-zinc-400" : "text-amber-300"}>
                  {formatUsd(l.amount)}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function CreditsPage() {
  return (
    <Suspense
      fallback={
        <div>
          <AppPageHeader title="Credits">Cargando…</AppPageHeader>
        </div>
      }
    >
      <CreditsInner />
    </Suspense>
  );
}
