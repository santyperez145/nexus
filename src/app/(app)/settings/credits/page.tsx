"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppPageHeader } from "@/components/layout/app-page-header";
import {
  CREDIT_PACKS,
  CREDIT_PURCHASE_FEE,
  CREDIT_PURCHASE_MIN_FEE_USD,
  SUBSCRIPTION_PLANS,
  creditPurchaseFeeUsd,
} from "@/lib/config";
import { resolveSubscriptionReturn } from "@/lib/billing/subscription-return";
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
  has_billing_profile: boolean;
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

type ApiEnvelope = {
  ok?: boolean;
  url?: string | null;
  error?: string | { message?: string };
};

const BLOCKING_SUBSCRIPTION_STATUSES = new Set([
  "incomplete",
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "paused",
]);

function apiMessage(value: ApiEnvelope, fallback: string) {
  return typeof value.error === "string"
    ? value.error
    : value.error?.message || fallback;
}

const LEDGER_TYPE_LABELS: Record<string, string> = {
  purchase: "Carga de saldo",
  subscription_credit: "Crédito del plan",
  signup_bonus: "Crédito de bienvenida",
  admin_adjustment: "Ajuste administrativo",
  reserve: "Reserva",
  reserve_release: "Liberación de reserva",
  inference: "Uso de modelos",
  byok_fee: "Comisión de proveedor propio",
  stripe_refund: "Reembolso",
  stripe_dispute_hold: "Retención por disputa",
  stripe_dispute_release: "Liberación de disputa",
};

const LEDGER_DATE_FORMAT = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function ledgerNoteLabel(note: string) {
  return note.replace("(fee ", "(comisión ");
}

function CreditsInner() {
  const params = useSearchParams();
  const checkoutSessionId = params.get("checkout_session");
  const legacyCheckoutOk = params.get("ok") === "1";
  const canceled = params.get("canceled") === "1";
  const subscriptionResult = params.get("subscription");
  const [credits, reload, creditsError] = useRemoteData<Credits>("/api/v1/credits");
  const [prefs, reloadPrefs, prefsError] = useRemoteData<Prefs>(
    "/api/internal/preferences",
  );
  const [analytics, , analyticsError] = useRemoteData<Analytics>("/api/v1/analytics?days=7");
  const [msg, setMsg] = useState<string | null>(
    subscriptionResult === "canceled" || canceled
      ? "Checkout cancelado."
      : checkoutSessionId
        ? "Confirmando pago con Stripe…"
        : legacyCheckoutOk
          ? "Pago completado. Actualizando el saldo…"
          : null,
  );
  const [settledSubscriptionNotice, setSettledSubscriptionNotice] = useState<
    string | null
  >(null);
  const [threshold, setThreshold] = useState<string | null>(null);
  const [amount, setAmount] = useState<string | null>(null);
  const [ledgerFilter, setLedgerFilter] = useState<"all" | "in" | "out">("all");
  const [teamSeats, setTeamSeats] = useState("5");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const subscriptionReturn = resolveSubscriptionReturn(
    subscriptionResult,
    credits?.subscription_status,
    credits?.plan,
  );
  const displayMessage =
    settledSubscriptionNotice ?? subscriptionReturn.notice ?? msg;
  const feePct = (CREDIT_PURCHASE_FEE * 100).toFixed(1);
  const thresholdValue =
    threshold ?? String(prefs?.autoTopupThresholdUsd ?? "5");
  const amountValue = amount ?? String(prefs?.autoTopupAmountUsd ?? "25");
  const canCheckout =
    credits?.billing_mode === "test" || credits?.billing_mode === "live";
  const hasBlockingSubscription = Boolean(
    credits?.subscription &&
      BLOCKING_SUBSCRIPTION_STATUSES.has(credits.subscription.status),
  );

  useEffect(() => {
    if (!checkoutSessionId) return;
    let active = true;
    let timer: number | undefined;
    let attempts = 0;

    async function reconcile() {
      attempts += 1;
      try {
        const response = await fetch("/api/internal/checkout", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: checkoutSessionId }),
        });
        const json = await response.json();
        if (!active) return;
        if (!response.ok) {
          setMsg(json.error?.message ?? "No se pudo verificar el pago.");
          window.history.replaceState({}, "", "/settings/credits");
          return;
        }
        if (json.data?.settled) {
          setMsg(
            `Se acreditaron ${formatUsd(Number(json.data.creditsUsd), 2)} al saldo.`,
          );
          reload();
          window.history.replaceState({}, "", "/settings/credits");
          return;
        }
      } catch {
        if (!active) return;
      }
      if (attempts >= 12) {
        setMsg(
          "Stripe todavía está procesando el pago. Refrescá en unos segundos.",
        );
        return;
      }
      timer = window.setTimeout(reconcile, 1500);
    }

    void reconcile();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [checkoutSessionId, reload]);

  useEffect(() => {
    if (!legacyCheckoutOk) return;
    const finish = window.setTimeout(() => {
      reload();
      window.history.replaceState({}, "", "/settings/credits");
    }, 0);
    return () => window.clearTimeout(finish);
  }, [legacyCheckoutOk, reload]);

  useEffect(() => {
    if (subscriptionReturn.state === "confirmed") {
      const finalize = window.setTimeout(() => {
        setSettledSubscriptionNotice(subscriptionReturn.notice);
        window.history.replaceState({}, "", "/settings/credits");
      }, 0);
      return () => window.clearTimeout(finalize);
    }
    if (subscriptionReturn.state !== "pending") return;
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
  }, [reload, subscriptionReturn.notice, subscriptionReturn.state]);

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
    if (!canCheckout || pendingAction) return;
    setPendingAction(`pack:${packId}`);
    setMsg(null);
    try {
      const res = await fetch("/api/internal/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId }),
      });
      const data = (await res.json().catch(() => ({}))) as ApiEnvelope;
      if (res.ok && data.url) {
        window.location.assign(data.url);
        return;
      }
      setMsg(apiMessage(data, "No se pudo iniciar la carga de saldo."));
    } catch {
      setMsg("No se pudo iniciar la carga de saldo. Revisá tu conexión.");
    } finally {
      setPendingAction(null);
    }
  }

  async function subscribe(planId: string, seats = 1) {
    if (!canCheckout || pendingAction) return;
    setPendingAction(`plan:${planId}`);
    setMsg(null);
    try {
      const res = await fetch("/api/internal/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, seats }),
      });
      const data = (await res.json().catch(() => ({}))) as ApiEnvelope;
      if (res.ok && data.url) return window.location.assign(data.url);
      setMsg(apiMessage(data, "No se pudo iniciar la suscripción."));
    } catch {
      setMsg("No se pudo iniciar la suscripción. Revisá tu conexión.");
    } finally {
      setPendingAction(null);
    }
  }

  async function manageSubscription() {
    if (!credits?.has_billing_profile || pendingAction) return;
    setPendingAction("portal");
    setMsg(null);
    try {
      const res = await fetch("/api/internal/checkout", { method: "PATCH" });
      const data = (await res.json().catch(() => ({}))) as ApiEnvelope;
      if (res.ok && data.url) return window.location.assign(data.url);
      setMsg(apiMessage(data, "No se pudo abrir el portal de facturación."));
    } catch {
      setMsg("No se pudo abrir el portal de facturación. Revisá tu conexión.");
    } finally {
      setPendingAction(null);
    }
  }

  async function saveTopup(enabled: boolean) {
    if (pendingAction) return;
    const parsedThreshold = Number(thresholdValue);
    const parsedAmount = Number(amountValue);
    if (
      !Number.isFinite(parsedThreshold) ||
      parsedThreshold < 1 ||
      parsedThreshold > 1_000 ||
      !Number.isFinite(parsedAmount) ||
      parsedAmount < 10 ||
      parsedAmount > 500
    ) {
      setMsg("Usá un umbral de $1 a $1.000 y una recarga de $10 a $500.");
      return;
    }
    setPendingAction("auto-topup");
    setMsg(null);
    try {
      const res = await fetch("/api/internal/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          autoTopupEnabled: enabled,
          autoTopupThresholdUsd: parsedThreshold,
          autoTopupAmountUsd: parsedAmount,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as ApiEnvelope;
      setMsg(
        res.ok && json.ok
          ? enabled
            ? "Recarga automática activada."
            : "Recarga automática desactivada."
          : apiMessage(json, "No pudimos guardar la recarga automática."),
      );
      if (res.ok) reloadPrefs();
    } catch {
      setMsg("No pudimos guardar la recarga automática. Revisá tu conexión.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div>
      <AppPageHeader title="Saldo y plan">
        Pagás el precio de lista del proveedor. Nexus aplica una comisión del{" "}
        {feePct}% al cargar saldo (mínimo{" "}
        {formatUsd(CREDIT_PURCHASE_MIN_FEE_USD, 2)}) y no agrega margen al uso
        de modelos.
      </AppPageHeader>

      {creditsError ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>No pudimos cargar tu saldo: {creditsError}</span>
          <Button variant="outline" size="sm" onClick={reload}>
            Reintentar
          </Button>
        </div>
      ) : null}

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
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
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
                  Consumo 7 días
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
                  Duración estimada
                </div>
                <div className="mt-0.5 text-lg text-zinc-900">
                  {runway == null
                    ? "n/d"
                    : runway === Infinity
                      ? "∞"
                      : `${runway}d`}
                </div>
                <div className="text-[11px] text-zinc-500">
                  saldo ÷ consumo diario
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                Consumo diario · últimos 7 días
              </div>
              <Link
                href="/analytics"
                className="text-[11px] text-violet-700 hover:underline"
              >
                Métricas →
              </Link>
            </div>
            {analyticsError ? (
              <p className="py-8 text-center text-sm text-red-700">
                No pudimos cargar el consumo reciente.
              </p>
            ) : analytics?.by_day?.length ? (
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
      ) : !creditsError ? (
        <div className="mb-6 grid animate-pulse gap-3 lg:grid-cols-[1.2fr_1fr]">
          <div className="h-52 rounded-2xl bg-zinc-100" />
          <div className="h-52 rounded-2xl bg-zinc-100" />
        </div>
      ) : null}

      <div className="mb-3 mt-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Planes</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Suscripción para capacidades de plataforma; la inferencia sigue
            descontándose del saldo.
          </p>
        </div>
        {credits?.has_billing_profile ? (
          <Button
            variant="outline"
            disabled={!canCheckout || Boolean(pendingAction)}
            onClick={() => void manageSubscription()}
          >
            {pendingAction === "portal" ? "Abriendo…" : "Gestionar facturación"}
          </Button>
        ) : null}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {SUBSCRIPTION_PLANS.map((plan) => {
          const current =
            credits?.plan === plan.id &&
            ["active", "trialing"].includes(credits.subscription_status);
          const actionPending = pendingAction === `plan:${plan.id}`;
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
              {plan.seats && !hasBlockingSubscription ? (
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
                variant={hasBlockingSubscription ? "outline" : "default"}
                disabled={
                  !canCheckout ||
                  Boolean(pendingAction) ||
                  (hasBlockingSubscription && !credits?.has_billing_profile)
                }
                onClick={() =>
                  hasBlockingSubscription
                    ? void manageSubscription()
                    : void subscribe(
                        plan.id,
                        plan.seats ? Math.max(1, Number(teamSeats) || 1) : 1,
                      )
                }
              >
                {actionPending
                  ? "Abriendo…"
                  : current
                  ? "Gestionar plan actual"
                  : hasBlockingSubscription
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

      <h2 className="mb-3 mt-10 text-lg font-medium">Cargas de saldo</h2>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {CREDIT_PACKS.map((p) => {
          const fee = creditPurchaseFeeUsd(p.usd);
          const charge = p.usd + fee;
          return (
            <div key={p.id} className="rounded-xl border border-zinc-200 p-4">
              <div className="text-2xl font-semibold">{p.label}</div>
              <p className="mt-1 text-xs text-zinc-500">
                Cargo ~{formatUsd(charge, 2)} · comisión {formatUsd(fee, 2)}
              </p>
              <Button
                className="mt-4 w-full"
                disabled={!canCheckout || Boolean(pendingAction)}
                onClick={() => void buy(p.id)}
              >
                {pendingAction === `pack:${p.id}`
                  ? "Abriendo…"
                  : credits?.billing_mode === "test"
                    ? "Probar"
                    : "Comprar"}
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
              const json = (await res.json().catch(() => ({}))) as ApiEnvelope;
              setMsg(
                json.ok
                  ? "Se acreditaron $10 (saldo manual)."
                  : apiMessage(json, "No se pudo acreditar el saldo manual."),
              );
              reload();
            }}
          >
            Cargar $10 sin Stripe
          </button>
        </p>
      ) : null}

      <h2 className="mt-10 mb-3 text-lg font-medium">Recarga automática</h2>
      <p className="mb-3 max-w-xl text-sm text-zinc-500">
        Estado:{" "}
        <span
          className={
            prefs?.autoTopupEnabled ? "text-emerald-700" : "text-zinc-500"
          }
        >
          {prefs?.autoTopupEnabled ? "activo" : "apagado"}
        </span>
        . {credits?.manual_credits
          ? "En este entorno de desarrollo, acredita saldo manual al pasar el umbral."
          : "Cuando está activa, cobra únicamente el medio de pago predeterminado guardado después de una compra compatible."}
      </p>
      {prefsError ? (
        <p className="mb-3 text-sm text-red-700">
          No pudimos cargar la configuración de recarga automática.
        </p>
      ) : null}
      <div className="grid max-w-2xl gap-3 rounded-2xl border border-zinc-200 bg-white p-4 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
        <label className="text-xs text-zinc-600">
          Recargar cuando baje de
          <Input
            className="mt-1.5"
            type="number"
            min={1}
            max={1000}
            step="0.01"
            value={thresholdValue}
            onChange={(e) => setThreshold(e.target.value)}
            aria-label="Umbral de recarga en dólares"
            disabled={!prefs || Boolean(pendingAction)}
          />
        </label>
        <label className="text-xs text-zinc-600">
          Importe a cargar
          <Input
            className="mt-1.5"
            type="number"
            min={10}
            max={500}
            step="0.01"
            value={amountValue}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="Importe de recarga en dólares"
            disabled={!prefs || Boolean(pendingAction)}
          />
        </label>
        <Button
          variant="outline"
          disabled={!prefs || !canCheckout || Boolean(pendingAction)}
          onClick={() => void saveTopup(true)}
        >
          {pendingAction === "auto-topup" ? "Guardando…" : "Activar"}
        </Button>
        <Button
          variant="outline"
          disabled={!prefs?.autoTopupEnabled || Boolean(pendingAction)}
          onClick={() => void saveTopup(false)}
        >
          Apagar
        </Button>
      </div>

      {displayMessage ? (
        <p role="status" aria-live="polite" className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-800">
          {displayMessage}
        </p>
      ) : null}

      {credits?.ledger?.length ? (
        <>
          <div className="mt-10 mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-medium">Movimientos</h2>
            <div className="flex gap-1 rounded-lg border border-zinc-200 p-0.5">
              {(
                [
                  ["all", "Todos"],
                  ["in", "Ingresos"],
                  ["out", "Egresos"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setLedgerFilter(id)}
                  className={`rounded-md px-2.5 py-1 text-xs ${
                    ledgerFilter === id
                      ? "bg-zinc-100 text-zinc-900"
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
                    {LEDGER_TYPE_LABELS[l.type] ?? "Movimiento"}
                  </span>
                  {l.note ? (
                    <span className="text-zinc-500">
                      {" "}
                      · {ledgerNoteLabel(l.note)}
                    </span>
                  ) : null}
                  <div className="text-[11px] text-zinc-600">
                    {LEDGER_DATE_FORMAT.format(new Date(l.created_at))}
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
