"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function PrivacyForm(props: { zdr: boolean; logPrompts: boolean; allowTraining: boolean }) {
  const [state, setState] = useState(props);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function update(patch: Partial<typeof state>) {
    const previous = state;
    const next = patch.zdr === true ? { ...state, ...patch, logPrompts: false } : { ...state, ...patch };
    setState(next);
    setMsg(null);
    setSaving(true);
    try {
      const res = await fetch("/api/internal/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const json = await res.json();
      if (!res.ok) {
        setState(previous);
        setMsg(json.error ?? "No se pudo guardar.");
        return;
      }
      setState((current) => ({ ...current, ...json.data }));
      const purged = Object.values(json.purged ?? {}).reduce(
        (total: number, value) => total + Number(value ?? 0),
        0,
      );
      setMsg(
        purged > 0
          ? `Guardado · ${purged} registros de contenido eliminados.`
          : "Guardado · aplica desde la próxima solicitud.",
      );
    } catch {
      setState(previous);
      setMsg("No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid max-w-2xl gap-3">
      <Row
        title="Zero Data Retention"
        body="Usa sólo proveedores con ZDR confirmado, elimina el historial de contenido guardado y desactiva su registro. El video asíncrono queda bloqueado porque necesita conservar estado de procesamiento."
      >
        <Switch disabled={saving} checked={state.zdr} onCheckedChange={(zdr) => void update({ zdr })} />
      </Row>
      <Row
        title="Guardar solicitudes y respuestas"
        body="Conserva contenido para depuración y aplica un 1% de descuento. Al desactivarlo, Nexus elimina el contenido histórico; las métricas de uso no se borran."
      >
        <Switch
          disabled={saving || state.zdr}
          checked={state.logPrompts}
          onCheckedChange={(logPrompts) => void update({ logPrompts })}
        />
      </Row>
      <Row
        title="Permitir uso para entrenamiento"
        body="Al desactivarlo, Nexus usa únicamente proveedores confirmados como no-entrenamiento. Las credenciales propias quedan fuera de este modo hasta registrar su garantía."
      >
        <Switch
          disabled={saving}
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
