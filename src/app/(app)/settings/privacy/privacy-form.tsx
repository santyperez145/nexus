"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function PrivacyForm(props: { zdr: boolean; logPrompts: boolean; allowTraining: boolean }) {
  const [state, setState] = useState(props);

  async function update(patch: Partial<typeof state>) {
    const next = { ...state, ...patch };
    setState(next);
    await fetch("/api/internal/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
  }

  return (
    <div className="grid gap-4">
      <label className="flex items-center justify-between rounded-lg border border-white/10 p-3">
        <Label>Zero Data Retention (solo providers ZDR)</Label>
        <Switch checked={state.zdr} onCheckedChange={(zdr) => void update({ zdr })} />
      </label>
      <label className="flex items-center justify-between rounded-lg border border-white/10 p-3">
        <Label>Loguear prompts/completions (−1% costo)</Label>
        <Switch checked={state.logPrompts} onCheckedChange={(logPrompts) => void update({ logPrompts })} />
      </label>
      <label className="flex items-center justify-between rounded-lg border border-white/10 p-3">
        <Label>Permitir providers que pueden entrenar</Label>
        <Switch
          checked={state.allowTraining}
          onCheckedChange={(allowTraining) => void update({ allowTraining })}
        />
      </label>
    </div>
  );
}
