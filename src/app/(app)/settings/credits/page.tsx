"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppPageHeader } from "@/components/layout/app-page-header";
import {
  CREDIT_PACKS,
  CREDIT_PURCHASE_FEE,
  CREDIT_PURCHASE_MIN_FEE_USD,
  SUBSCRIPTION_PLANS,
  creditPurchaseFeeUsd,
} from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUsd } from "@/lib/money";
import { useRemoteData } from "@/lib/use-remote-data";

type Credits = {
  remaining: number;
  total_credits: number;
  total_usage: number;
  manual_credits?: boolean;
  billing_mode: "test" | "live" | "unconfigured" | "unknown";
  plan: string;
  subscription_status: string;
  subscription?: {
    plan: string;
    status: string;
    quantity: number;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  } | null;
  ledger: Array<{
    id: string;
    type: string;
    amount: number;
    note: string | null;
    created_at: string;
  }>;
};

type Prefs = {
  autoTopupEnabled?: boolean;
  autoTopupThresholdUsd?: string | null;
  autoTopupAmountUsd?: string | null;
};

type Analytics = {
  totals: { cost: number; requests: number };
  by_day: Array<{ day: string; cost: number; requests: number }>;
};

function CreditsInner() {
  const params = useSearchParams();
  const checkoutOk = params.get("ok") === "1";
  const canceled = params.get("canceled") === "1";
  const subscriptionResult = params.get("subscription");
  const [credits, reload] = useRemoteData<Credits>("/api/v1/credits");
  const [prefs, reloadPrefs] = useRemoteData<Prefs>(
    "/api/internal/preferences",
  );
  const [analytics] = useRemoteData<Analytics>("/api/v1/analytics?days=7");
  const [msg, setMsg] = useState<string | null>(
    subscriptionResult === "ok"
      ? "Confirmando suscripción con Stripe…"
      : subscriptionResult === "canceled" || canceled
        ? "Checkout cancelado."
        : checkoutOk
          ? "Confirmando pago con Stripe…"
          : null,
  );
  const [threshold, setThreshold] = useState<string | null>(null);
  const [amount, setAmount] = useState<string | null>(null);
  const [ledgerFilter, setLedgerFilter] = useState<"all" | "in" | "out">("all");
  const [teamSeats, setTeamSeats] = useState("5");
  const subscriptionConfirmed =
    subscriptionResult === "ok" &&
    ["active", "trialing"].includes(credits?.subscription_status ?? "");
  const displayMessage = subscriptionConfirmed
    ? `Plan ${credits?.plan ?? ""} activo.`
    : msg;
  const baseline = useRef<number | null>(null);
  const polls = useRef(0);
  const feePct = (CREDIT_PURCHASE_FEE * 100).toFixed(1);
  const thresholdValue =
    threshold ?? String(prefs?.autoTopupThresholdUsd ?? "5");
  const amountValue = amount ?? String(prefs?.autoTopupAmountUsd ?? "25");

  useEffect(() => {
    if (!checkoutOk) return;
    if (credits && baseline.current == null)
      baseline.current = credits.remaining;
    const timer = window.setInterval(() => {
      polls.current += 1;
      reload();
      if (polls.current >= 12) {
        window.clearInterval(timer);
        setMsg(
          "Si el saldo no cambió, el webhook puede demorar unos segundos. Refrescá.",
        );
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

  useEffect(() => {
    if (subscriptionResult !== "ok") return;
    if (subscriptionConfirmed) {
      window.history.replaceState({}, "", "/settings/credits");
      return;
    }
    const timer = window.setInterval(reload, 1500);
    const stop = window.setTimeout(() => {
      window.clearInterval(timer);
      setMsg(
        "Stripe está confirmando la suscripción. Refrescá en unos segundos.",
      );
    }, 18_000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [reload, subscriptionConfirmed, subscriptionResult]);

  const burn7d = analytics?.totals.cost ?? 0;
  const dailyBurn = burn7d / 7;
  const runway =
    credits && dailyBurn > 0.0001
      ? Math.floor(credits.remaining / dailyBurn)
      : credits && analytics && analytics.totals.requests === 0
        ? null
        : credits
          ? Infinity
          : null;

  const maxDayCost = Math.max(
    1,
    ...(analytics?.by_day.map((d) => d.cost) ?? [1]),
  );

  const ledger = useMemo(() => {
    const rows = credits?.ledger ?? [];
    if (ledgerFilter === "in") return rows.filter((l) => l.amount > 0);
    if (ledgerFilter === "out") return rows.filter((l) => l.amount < 0);
    return rows;
  }, [credits?.ledger, ledgerFilter]);

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

  async function subscribe(planId: string, seats = 1) {
    setMsg(null);
    const res = await fetch("/api/internal/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, seats }),
    });
    const data = await res.json();
    if (data.url) return window.location.assign(data.url);
    setMsg(data.error ?? "No se pudo iniciar la suscripción");
  }

  async function manageSubscription() {
    setMsg(null);
    const res = await fetch("/api/internal/checkout", { method: "PATCH" });
    const data = await res.json();
    if (data.url) return window.location.assign(data.url);
    setMsg(data.error ?? "No se pudo abrir el portal de facturación");
  }

  async function saveTopup(enabled: boolean) {
    const res = await fetch("/api/internal/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        autoTopupEnabled: enabled,
        autoTopupThresholdUsd: Number(thresholdValue),
        autoTopupAmountUsd: Number(amountValue),
      }),
    });
    const json = await res.json();
    setMsg(
      json.ok
        ? enabled
          ? "Auto top-up activado"
          : "Auto top-up desactivado"
        : json.error,
    );
    reloadPrefs();
  }

  return (
    <div>
      <AppPageHeader title="Saldo y plan">
        Pagás el precio de lista del proveedor. Nexus aplica una comisión del{" "}
        {feePct}% al cargar saldo (mínimo{" "}
        {formatUsd(CREDIT_PURCHASE_MIN_FEE_USD, 2)}) y no agrega margen al uso
        de modelos.
      </AppPageHeader>

      {credits?.billing_mode === "test" ? (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <span className="font-semibold">Stripe sandbox activo.</span> Los
          checkouts permiten probar el flujo completo, pero no generan cobros ni
          ingresos reales.
        </div>
      ) : credits?.billing_mode === "unconfigured" ||
        credits?.billing_mode === "unknown" ? (
        <div className="mb-6 rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
          Los cobros no están disponibles en esta instalación.
        </div>
      ) : null}

      {credits ? (
        <div className="mb-6 grid gap-3 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  Saldo
                </div>
                <div className="mt-1 text-3xl font-semibold text-zinc-950">
                  {formatUsd(credits.remaining, 2)}
                </div>
              </div>
              <div className="text-right text-xs text-zinc-500">
                <div>cargado {formatUsd(credits.total_credits, 2)}</div>
                <div>usado {formatUsd(credits.total_usage, 2)}</div>
              </div>
            </div>
            {credits.total_credits > 0 ? (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-violet-500"
                  style={{
                    width: `${Math.min(100, (credits.remaining / credits.total_credits) * 100)}%`,
                  }}
                />
              </div>
            ) : null}
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-zinc-200 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                  Burn 7d
                </div>
                <div className="mt-0.5 text-lg text-zinc-900">
                  {formatUsd(burn7d, 2)}
                </div>
                <div className="text-[11px] text-zinc-500">
                  ~{formatUsd(dailyBurn, 4)}/día
                </div>
              </div>
              <div className="rounded-xl border border-zinc-200 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                  Runway
                </div>
                <div className="mt-0.5 text-lg text-zinc-900">
                  {runway == null
                    ? "n/d"
                    : runway === Infinity
                      ? "∞"
                      : `${runway}d`}
                </div>
                <div className="text-[11px] text-zinc-500">
                  saldo ÷ burn diario
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                Burn diario · 7d
              </div>
              <Link
                href="/analytics"
                className="text-[11px] text-violet-700 hover:underline"
              >
                Analytics →
              </Link>
            </div>
            {analytics?.by_day?.length ? (
              <div className="flex h-24 items-end gap-1">
                {analytics.by_day.map((d) => (
                  <div
                    key={d.day}
                    className="flex flex-1 flex-col items-center gap-1"
                  >
                    <div
                      className="w-full rounded-sm bg-violet-400"
                      style={{
                        height: `${Math.max(4, (d.cost / maxDayCost) * 100)}%`,
                      }}
                      title={`${d.day}: ${formatUsd(d.cost, 4)}`}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-zinc-500">
                Sin burn aún esta semana.
              </p>
            )}
          </div>
        </div>
      ) : null}

      <div className="mb-3 mt-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Planes</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Suscripción para capacidades de plataforma; la inferencia sigue
            descontándose del wallet.
          </p>
        </div>
        {credits?.subscription ? (
          <Button variant="outline" onClick={() => void manageSubscription()}>
            Gestionar suscripción
          </Button>
        ) : null}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {SUBSCRIPTION_PLANS.map((plan) => {
          const current =
            credits?.plan === plan.id &&
            ["active", "trialing"].includes(credits.subscription_status);
          return (
            <div
              key={plan.id}
              className={`rounded-2xl border bg-white p-5 ${current ? "border-violet-300 ring-2 ring-violet-100" : "border-zinc-200"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xl font-semibold text-zinc-950">
                    {plan.name}
                  </div>
                  <p className="mt-1 text-sm text-zinc-500">
                    {plan.description}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold text-zinc-950">
                    ${plan.monthlyUsd}
                  </div>
                  <div className="text-xs text-zinc-500">
                    /mes{plan.seats ? " por asiento" : ""}
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm text-zinc-700">
                Incluye ${plan.includedCreditsUsd} en créditos de inferencia por
                factura pagada.
              </p>
              {plan.seats && !credits?.subscription ? (
                <label className="mt-4 block text-xs text-zinc-600">
                  Asientos Team
                  <Input
                    className="mt-1"
                    type="number"
                    min={1}
                    max={250}
                    value={teamSeats}
                    onChange={(event) => setTeamSeats(event.target.value)}
                  />
                </label>
              ) : null}
              <Button
                className="mt-4 w-full"
                variant={credits?.subscription ? "outline" : "default"}
                onClick={() =>
                  credits?.subscription
                    ? void manageSubscription()
                    : void subscribe(
                        plan.id,
                        plan.seats ? Math.max(1, Number(teamSeats) || 1) : 1,
                      )
                }
              >
                {current
                  ? "Gestionar plan actual"
                  : credits?.subscription
                    ? "Cambiar en portal"
                    : credits?.billing_mode === "test"
                      ? `Probar ${plan.name}`
                      : `Elegir ${plan.name}`}
              </Button>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        Impuestos no incluidos: se calculan solo cuando la cuenta Stripe tiene
        registros fiscales activos.
      </p>

      <h2 className="mb-3 mt-10 text-lg font-medium">Packs</h2>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {CREDIT_PACKS.map((p) => {
          const fee = creditPurchaseFeeUsd(p.usd);
          const charge = p.usd + fee;
          return (
            <div key={p.id} className="rounded-xl border border-zinc-200 p-4">
              <div className="text-2xl font-semibold">{p.label}</div>
              <p className="mt-1 text-xs text-zinc-500">
                Cargo ~{formatUsd(charge, 2)} · fee {formatUsd(fee, 2)}
              </p>
              <Button className="mt-4 w-full" onClick={() => void buy(p.id)}>
                {credits?.billing_mode === "test" ? "Probar" : "Comprar"}
              </Button>
            </div>
          );
        })}
      </div>

      {credits?.manual_credits ? (
        <p className="mt-4 text-sm text-zinc-500">
          Stripe no es obligatorio en este entorno.{" "}
          <button
            type="button"
            className="text-violet-700 hover:underline"
            onClick={async () => {
              const res = await fetch("/api/internal/credits/grant", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ usd: 10 }),
              });
              const json = await res.json();
              setMsg(
                json.ok ? "Se acreditaron $10 (wallet manual)" : json.error,
              );
              reload();
            }}
          >
            Cargar $10 sin Stripe
          </button>
        </p>
      ) : null}

      <h2 className="mt-10 mb-3 text-lg font-medium">Auto top-up</h2>
      <p className="mb-3 max-w-xl text-sm text-zinc-500">
        Estado:{" "}
        <span
          className={
            prefs?.autoTopupEnabled ? "text-emerald-400" : "text-zinc-400"
          }
        >
          {prefs?.autoTopupEnabled ? "activo" : "apagado"}
        </span>
        . Con wallet manual acredita al pasar el umbral. En producción cobra
        únicamente el método predeterminado guardado después de un checkout
        compatible.
      </p>
      <div className="grid max-w-xl gap-2 md:grid-cols-[1fr_1fr_auto_auto]">
        <Input
          value={thresholdValue}
          onChange={(e) => setThreshold(e.target.value)}
          aria-label="Umbral USD"
          placeholder="Umbral"
        />
        <Input
          value={amountValue}
          onChange={(e) => setAmount(e.target.value)}
          aria-label="Monto USD"
          placeholder="Monto"
        />
        <Button variant="outline" onClick={() => void saveTopup(true)}>
          Activar
        </Button>
        <Button
          variant="outline"
          disabled={!prefs?.autoTopupEnabled}
          onClick={() => void saveTopup(false)}
        >
          Apagar
        </Button>
      </div>

      {displayMessage ? (
        <p className="mt-4 text-sm text-zinc-950">{displayMessage}</p>
      ) : null}

      {credits?.ledger?.length ? (
        <>
          <div className="mt-10 mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-medium">Ledger</h2>
            <div className="flex gap-1 rounded-lg border border-zinc-200 p-0.5">
              {(
                [
                  ["all", "All"],
                  ["in", "In"],
                  ["out", "Out"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setLedgerFilter(id)}
                  className={`rounded-md px-2.5 py-1 text-xs ${
                    ledgerFilter === id
                      ? "bg-white/10 text-zinc-900"
                      : "text-zinc-500 hover:text-zinc-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            {ledger.map((l) => (
              <div
                key={l.id}
                className="flex justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <span className="font-mono text-xs text-zinc-400">
                    {l.type}
                  </span>
                  {l.note ? (
                    <span className="text-zinc-500"> · {l.note}</span>
                  ) : null}
                  <div className="text-[11px] text-zinc-600">
                    {new Date(l.created_at).toISOString().slice(0, 19)}Z
                  </div>
                </div>
                <span
                  className={l.amount < 0 ? "text-zinc-400" : "text-zinc-950"}
                >
                  {formatUsd(l.amount)}
                </span>
              </div>
            ))}
            {!ledger.length ? (
              <p className="text-sm text-zinc-500">
                Sin filas para este filtro.
              </p>
            ) : null}
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
          <AppPageHeader title="Saldo y plan">Cargando…</AppPageHeader>
        </div>
      }
    >
      <CreditsInner />
    </Suspense>
  );
}
