"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function PrivacyForm(props: { zdr: boolean; logPrompts: boolean; allowTraining: boolean }) {
  const [state, setState] = useState(props);
  const [msg, setMsg] = useState<string | null>(null);

  async function update(patch: Partial<typeof state>) {
    const next = { ...state, ...patch };
    setState(next);
    setMsg(null);
    const res = await fetch("/api/internal/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    setMsg(res.ok ? "Guardado · aplica en el próximo request." : "No se pudo guardar.");
  }

  return (
    <div className="grid max-w-2xl gap-3">
      <Row
        title="Zero Data Retention"
        body="Hard-filter a providers marcados ZDR en el catálogo. Si ningún hop queda, el request falla — no hay fallback silencioso a no-ZDR."
      >
        <Switch checked={state.zdr} onCheckedChange={(zdr) => void update({ zdr })} />
      </Row>
      <Row
        title="Loguear prompts / completions"
        body="Habilita retention de payloads para debugging (−1% sobre lista). No sustituye un DPA ni borra logs de Activity metadata."
      >
        <Switch checked={state.logPrompts} onCheckedChange={(logPrompts) => void update({ logPrompts })} />
      </Row>
      <Row
        title="Providers que pueden entrenar"
        body="OFF filtra labs que reportan training-capable. Útil junto a ZDR; independiente de Guardrails de contenido."
      >
        <Switch
          checked={state.allowTraining}
          onCheckedChange={(allowTraining) => void update({ allowTraining })}
        />
      </Row>
      {msg ? <p className="text-sm text-zinc-950">{msg}</p> : null}
    </div>
  );
}

function Row({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-2xl border border-zinc-200 p-4">
      <div className="min-w-0">
        <Label className="text-zinc-900">{title}</Label>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">{body}</p>
      </div>
      <div className="pt-0.5">{children}</div>
    </label>
  );
}
