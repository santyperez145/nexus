"use client";

import { AppPageHeader } from "@/components/layout/app-page-header";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

type Prefs = {
  notifyLowBalance: boolean;
  notifyKeyLimit: boolean;
  notifyOrgInvite: boolean;
  lowBalanceThresholdUsd: string;
};

export default function NotificationsPage() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/internal/preferences", { signal: ac.signal })
      .then((r) => r.json())
      .then((json) => {
        if (ac.signal.aborted) return;
        setPrefs({
          notifyLowBalance: json.data?.notifyLowBalance ?? true,
          notifyKeyLimit: json.data?.notifyKeyLimit ?? true,
          notifyOrgInvite: json.data?.notifyOrgInvite ?? true,
          lowBalanceThresholdUsd: String(json.data?.lowBalanceThresholdUsd ?? "5"),
        });
      })
      .catch(() => undefined);
    return () => ac.abort();
  }, []);

  async function save(patch: Partial<Prefs>) {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
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
        Emails de saldo bajo y keys cerca del límite. Sin Resend, el mail queda en logs del
        servidor (como forgot-password). Webhooks outbound viven en Observability.
      </AppPageHeader>

      <div className="max-w-lg space-y-5 rounded-2xl border border-white/10 px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <Label>Saldo bajo</Label>
          <Switch
            checked={prefs.notifyLowBalance}
            onCheckedChange={(v) => void save({ notifyLowBalance: v })}
          />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs text-zinc-500">Umbral USD</Label>
          <div className="flex gap-2">
            <Input
              value={prefs.lowBalanceThresholdUsd}
              onChange={(e) => setPrefs({ ...prefs, lowBalanceThresholdUsd: e.target.value })}
              className="w-28"
              inputMode="decimal"
            />
            <Button size="sm" variant="outline" onClick={() => void save({})}>
              Aplicar umbral
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-white/5 pt-4">
          <Label>Key ≥ 90% del límite</Label>
          <Switch
            checked={prefs.notifyKeyLimit}
            onCheckedChange={(v) => void save({ notifyKeyLimit: v })}
          />
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-white/5 pt-4">
          <Label>Invites de organización</Label>
          <Switch
            checked={prefs.notifyOrgInvite}
            onCheckedChange={(v) => void save({ notifyOrgInvite: v })}
          />
        </div>
      </div>
      {msg ? <p className="mt-4 text-sm text-amber-300">{msg}</p> : null}
    </div>
  );
}
