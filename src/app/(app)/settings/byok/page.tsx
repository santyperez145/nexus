"use client";

import { AppPageHeader } from "@/components/layout/app-page-header";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Input } from "@/components/ui/input";
import { BYOK_FEE } from "@/lib/config";
import { useRemoteData } from "@/lib/use-remote-data";

type Lab = { name: string; label?: string; wired?: boolean };
type Row = { id: string; provider: string; label: string | null; created_at?: string };

export default function ByokPage() {
  const [provider, setProvider] = useState("openai");
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [rowsData, reloadRows, rowsError] = useRemoteData<Row[]>("/api/v1/byok");
  const [labsData, reloadLabs, labsError] = useRemoteData<Lab[]>("/api/v1/providers");
  const rows = rowsData ?? [];
  const labs = labsData ?? [];
  const selectedProvider = labs.some((lab) => lab.name === provider)
    ? provider
    : (labs[0]?.name ?? provider);
  const loadError = rowsError ?? labsError;

  function reload() {
    reloadRows();
    reloadLabs();
  }

  async function save() {
    setMsg(null);
    try {
      const res = await fetch("/api/v1/byok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: selectedProvider, key, label: label || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "No se pudo guardar la credencial");
      setMsg("Key guardada (cifrada).");
      setKey("");
      setLabel("");
      reload();
    } catch (reason) {
      setMsg(reason instanceof Error ? reason.message : "No se pudo guardar la credencial");
    }
  }

  async function testRoute() {
    setPreview(null);
    try {
      const res = await fetch("/api/v1/routing/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "nexus/auto",
          provider: { only: [selectedProvider], allow_fallbacks: false },
          messages: [{ role: "user", content: "byok preview" }],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "No se pudo calcular la ruta");
      const hops = json.data?.hops ?? [];
      const wired = hops.filter((h: { wired?: boolean }) => h.wired).length;
      setPreview(`mode=${json.data.mode} · hops=${hops.length} · wired=${wired} (incluye BYOK de sesión)`);
    } catch (reason) {
      setPreview(reason instanceof Error ? reason.message : "No se pudo calcular la ruta");
    }
  }

  const feePct = (BYOK_FEE * 100).toFixed(0);

  return (
    <div>
      <AppPageHeader title="BYOK">
        Traé tus keys de cualquier lab. Se cifran en reposo. Fee BYOK: {feePct}% sobre precio de lista
        (después del allowance). El router las usa cuando el pool no tiene ese adapter.
      </AppPageHeader>

      <div className="mb-4 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-400">
        Fee de carga de créditos ≠ fee BYOK. Inferencia pool = 0% markup.{" "}
        <Link href="/docs/limits" className="text-violet-700 hover:underline">
          Limits
        </Link>
      </div>

      <div className="mb-6 grid gap-2 md:grid-cols-2 lg:grid-cols-4">
        <select
          value={selectedProvider}
          onChange={(e) => setProvider(e.target.value)}
          aria-label="Proveedor"
          className="h-9 rounded-md border border-zinc-200 bg-zinc-50 px-3 text-sm"
        >
          {labs.map((l) => (
            <option key={l.name} value={l.name}>
              {l.label ?? l.name}
              {l.wired ? " · platform" : ""}
            </option>
          ))}
        </select>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (opcional)" />
        <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-..." type="password" />
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => void save()} disabled={!key.trim()}>
            Guardar
          </Button>
          <Button variant="outline" onClick={() => void testRoute()}>
            Preview
          </Button>
        </div>
      </div>
      {preview ? <p className="mb-4 font-mono text-xs text-zinc-500">{preview}</p> : null}
      {msg ? <p className="mb-4 text-sm text-zinc-600">{msg}</p> : null}
      {loadError ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>No se pudieron cargar las conexiones: {loadError}</span>
          <Button size="sm" variant="outline" onClick={reload}>
            Reintentar
          </Button>
        </div>
      ) : null}

      <div className="grid gap-2">
        {rows.map((r) => (
          <div
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          >
            <div>
              <div className="font-mono text-violet-700">{r.provider}</div>
              <div className="text-xs text-zinc-500">
                {r.label ?? "—"}
                {r.created_at ? ` · ${new Date(r.created_at).toISOString().slice(0, 10)}` : ""}
              </div>
            </div>
            <ConfirmAction
              triggerLabel="Quitar"
              title={`Quitar credencial de ${r.provider}`}
              description="Nexus dejará de usar esta credencial. Las solicitudes que dependan de ella podrían dejar de funcionar."
              confirmLabel="Quitar credencial"
              onConfirm={async () => {
                try {
                  const response = await fetch(`/api/v1/byok?id=${r.id}`, { method: "DELETE" });
                  const json = await response.json();
                  if (!response.ok) {
                    throw new Error(json.error?.message ?? "No se pudo quitar la credencial");
                  }
                  setMsg("Credencial eliminada.");
                  reload();
                } catch (reason) {
                  setMsg(reason instanceof Error ? reason.message : "No se pudo quitar la credencial");
                }
              }}
            />
          </div>
        ))}
        {!rows.length && !loadError ? (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500">
            Todavía no hay BYOK. Guardá una key o usá{" "}
            <Link href="/settings/connections" className="text-violet-700 hover:underline">
              Conexiones
            </Link>{" "}
            de plataforma.
          </p>
        ) : null}
      </div>
    </div>
  );
}
