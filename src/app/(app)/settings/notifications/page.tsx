"use client";

import Link from "next/link";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useRemoteData } from "@/lib/use-remote-data";

type Prefs = {
  notifyLowBalance: boolean;
  notifyKeyLimit: boolean;
  notifyOrgInvite: boolean;
  lowBalanceThresholdUsd: string;
};

export default function NotificationsPage() {
  const [remote, reload] = useRemoteData<Prefs>("/api/internal/preferences");
  const [draftThreshold, setDraftThreshold] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const prefs: Prefs | null = remote
    ? {
        notifyLowBalance: remote.notifyLowBalance ?? true,
        notifyKeyLimit: remote.notifyKeyLimit ?? true,
        notifyOrgInvite: remote.notifyOrgInvite ?? true,
        lowBalanceThresholdUsd: String(remote.lowBalanceThresholdUsd ?? "5"),
      }
    : null;

  const threshold = draftThreshold ?? prefs?.lowBalanceThresholdUsd ?? "5";

  async function save(patch: Partial<Prefs>) {
    if (!prefs) return;
    const next = { ...prefs, ...patch, lowBalanceThresholdUsd: threshold };
    setMsg(null);
    const res = await fetch("/api/internal/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notifyLowBalance: next.notifyLowBalance,
        notifyKeyLimit: next.notifyKeyLimit,
        notifyOrgInvite: next.notifyOrgInvite,
        lowBalanceThresholdUsd: Number(next.lowBalanceThresholdUsd),
      }),
    });
    setMsg(res.ok ? "Guardado." : "No se pudo guardar.");
    setDraftThreshold(null);
    reload();
  }

  async function sendTest() {
    setTesting(true);
    setMsg(null);
    const res = await fetch("/api/internal/notifications/test", { method: "POST" });
    const json = await res.json();
    setTesting(false);
    if (!res.ok) {
      setMsg(json.error ?? "No se pudo enviar");
      return;
    }
    setMsg(`Test → ${json.to}. ${json.note}`);
  }

  if (!prefs) {
    return (
      <div>
        <AppPageHeader title="Notifications">Cargando…</AppPageHeader>
      </div>
    );
  }

  return (
    <div>
      <AppPageHeader title="Notifications">
        Emails de saldo bajo, keys cerca del límite e invites. Sin Resend, el mail queda en logs.
        Webhooks outbound viven en Observability.
      </AppPageHeader>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          {
            t: "Email alerts",
            d: "Saldo / key limit / invites",
            href: null as string | null,
          },
          {
            t: "Webhooks",
            d: "HMAC generation events",
            href: "/settings/observability",
          },
          {
            t: "Activity",
            d: "Ledger de generaciones",
            href: "/activity",
          },
        ].map((c) =>
          c.href ? (
            <Link
              key={c.t}
              href={c.href}
              className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 transition-colors hover:border-amber-400/30"
            >
              <div className="font-[family-name:var(--font-syne)] font-semibold text-zinc-100">
                {c.t}
              </div>
              <p className="mt-1 text-xs text-zinc-500">{c.d}</p>
            </Link>
          ) : (
            <div key={c.t} className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
              <div className="font-[family-name:var(--font-syne)] font-semibold text-zinc-100">
                {c.t}
              </div>
              <p className="mt-1 text-xs text-zinc-500">{c.d}</p>
            </div>
          ),
        )}
      </div>

      <div className="max-w-lg space-y-5 rounded-2xl border border-white/10 px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label>Saldo bajo</Label>
            <p className="mt-0.5 text-xs text-zinc-500">Cuando el wallet cruza el umbral</p>
          </div>
          <Switch
            checked={prefs.notifyLowBalance}
            onCheckedChange={(v) => void save({ notifyLowBalance: v })}
          />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs text-zinc-500">Umbral USD</Label>
          <div className="flex gap-2">
            <Input
              value={threshold}
              onChange={(e) => setDraftThreshold(e.target.value)}
              className="w-28"
              inputMode="decimal"
            />
            <Button size="sm" variant="outline" onClick={() => void save({})}>
              Aplicar umbral
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-white/5 pt-4">
          <div>
            <Label>Key ≥ 90% del límite</Label>
            <p className="mt-0.5 text-xs text-zinc-500">Spend limit por API key</p>
          </div>
          <Switch
            checked={prefs.notifyKeyLimit}
            onCheckedChange={(v) => void save({ notifyKeyLimit: v })}
          />
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-white/5 pt-4">
          <div>
            <Label>Invites de organización</Label>
            <p className="mt-0.5 text-xs text-zinc-500">Cuando te invitan a una org</p>
          </div>
          <Switch
            checked={prefs.notifyOrgInvite}
            onCheckedChange={(v) => void save({ notifyOrgInvite: v })}
          />
        </div>
      </div>

      <div className="mt-6 max-w-lg rounded-2xl border border-dashed border-white/15 px-4 py-4">
        <div className="font-[family-name:var(--font-syne)] font-semibold text-zinc-100">
          Probar canal
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          Manda un mail de prueba a tu cuenta. Confirma Resend o revisá logs si no llega.
        </p>
        <Button
          className="mt-3"
          size="sm"
          variant="outline"
          disabled={testing}
          onClick={() => void sendTest()}
        >
          {testing ? "Enviando…" : "Send test email"}
        </Button>
      </div>

      {msg ? <p className="mt-4 text-sm text-amber-300">{msg}</p> : null}
    </div>
  );
}
