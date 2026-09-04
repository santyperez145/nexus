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
type Row = {
  id: string;
  provider: string;
  label: string | null;
  workspace_id?: string | null;
  created_at?: string;
  can_manage?: boolean;
};
type Workspace = { id: string; name: string; can_manage?: boolean };

export default function ByokPage() {
  const [provider, setProvider] = useState("openai");
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [rowsData, reloadRows, rowsError] =
    useRemoteData<Row[]>("/api/v1/byok");
  const [labsData, reloadLabs, labsError] =
    useRemoteData<Lab[]>("/api/v1/providers");
  const [workspaceData, reloadWorkspaces, workspaceError] =
    useRemoteData<Workspace[]>("/api/v1/workspaces");
  const rows = rowsData ?? [];
  const labs = labsData?.length
    ? [
        ...labsData,
        ...(labsData.some((lab) => lab.name === "fal")
          ? []
          : [{ name: "fal", label: "fal.ai" }]),
      ]
    : [
        { name: "openai", label: "OpenAI" },
        { name: "fal", label: "fal.ai" },
      ];
  const workspaces = (workspaceData ?? []).filter(
    (workspace) => workspace.can_manage !== false,
  );
  const selectedProvider = labs.some((lab) => lab.name === provider)
    ? provider
    : (labs[0]?.name ?? provider);
  const loadError = rowsError ?? labsError ?? workspaceError;

  function reload() {
    reloadRows();
    reloadLabs();
    reloadWorkspaces();
  }

  async function save() {
    setMsg(null);
    setSaving(true);
    try {
      const res = await fetch("/api/v1/byok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selectedProvider,
          key,
          label: label || undefined,
          workspace_id: workspaceId || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok)
        throw new Error(
          json.error?.message ?? "No se pudo guardar la credencial",
        );
      setMsg(
        json.data?.replaced
          ? "Credencial reemplazada. La anterior fue invalidada."
          : "Credencial guardada y cifrada.",
      );
      setKey("");
      setLabel("");
      reload();
    } catch (reason) {
      setMsg(
        reason instanceof Error
          ? reason.message
          : "No se pudo guardar la credencial",
      );
    } finally {
      setSaving(false);
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
      if (!res.ok)
        throw new Error(json.error?.message ?? "No se pudo calcular la ruta");
      const hops = json.data?.hops ?? [];
      const wired = hops.filter((h: { wired?: boolean }) => h.wired).length;
      setPreview(
        `Ruta lista · ${hops.length} opciones · ${wired} con credencial disponible`,
      );
    } catch (reason) {
      setPreview(
        reason instanceof Error
          ? reason.message
          : "No se pudo calcular la ruta",
      );
    }
  }

  const feePct = (BYOK_FEE * 100).toFixed(0);

  return (
    <div>
      <AppPageHeader title="Proveedores propios">
        Conectá tus propias credenciales de proveedor. Nexus las cifra en reposo
        y las mantiene separadas por cuenta o espacio de trabajo. La comisión
        por uso es del {feePct}% sobre el precio de lista.
      </AppPageHeader>

      <div className="mb-4 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">
        Las credenciales nunca vuelven a mostrarse. Guardar otra del mismo
        proveedor y ámbito reemplaza la anterior de forma segura.{" "}
        <Link href="/docs/limits" className="text-violet-700 hover:underline">
          Ver precios y límites
        </Link>
      </div>

      <div className="mb-6 grid gap-2 rounded-2xl border border-zinc-200 bg-white p-4 md:grid-cols-2 lg:grid-cols-5">
        <select
          value={selectedProvider}
          onChange={(e) => setProvider(e.target.value)}
          aria-label="Proveedor"
          className="h-9 rounded-md border border-zinc-200 bg-zinc-50 px-3 text-sm"
        >
          {labs.map((l) => (
            <option key={l.name} value={l.name}>
              {l.label ?? l.name}
              {l.wired ? " · disponible en Nexus" : ""}
            </option>
          ))}
        </select>
        <select
          value={workspaceId}
          onChange={(event) => setWorkspaceId(event.target.value)}
          aria-label="Ámbito de la credencial"
          className="h-9 rounded-md border border-zinc-200 bg-zinc-50 px-3 text-sm"
        >
          <option value="">Mi cuenta</option>
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Nombre opcional"
        />
        <Input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Credencial del proveedor"
          type="password"
        />
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={() => void save()}
            disabled={!key.trim() || saving}
          >
            {saving ? "Guardando…" : "Guardar"}
          </Button>
          <Button
            variant="outline"
            onClick={() => void testRoute()}
            disabled={Boolean(workspaceId)}
            title={
              workspaceId
                ? "Probá esta conexión con una clave del espacio"
                : undefined
            }
          >
            Probar ruta
          </Button>
        </div>
      </div>
      {workspaceId ? (
        <p className="mb-4 text-xs text-zinc-500">
          Esta credencial solo se usará con claves API vinculadas a ese espacio.
        </p>
      ) : null}
      {preview ? <p className="mb-4 text-xs text-zinc-500">{preview}</p> : null}
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
                {` · ${
                  r.workspace_id
                    ? (workspaces.find(
                        (workspace) => workspace.id === r.workspace_id,
                      )?.name ?? "Espacio compartido")
                    : "Mi cuenta"
                }`}
                {r.created_at
                  ? ` · ${new Date(r.created_at).toISOString().slice(0, 10)}`
                  : ""}
              </div>
            </div>
            {r.can_manage === false ? (
              <span className="text-xs text-zinc-500">
                Administrada por el equipo
              </span>
            ) : (
              <ConfirmAction
                triggerLabel="Quitar"
                title={`Quitar credencial de ${r.provider}`}
                description="Nexus dejará de usar esta credencial. Las solicitudes que dependan de ella podrían dejar de funcionar."
                confirmLabel="Quitar credencial"
                onConfirm={async () => {
                  try {
                    const response = await fetch(`/api/v1/byok?id=${r.id}`, {
                      method: "DELETE",
                    });
                    const json = await response.json();
                    if (!response.ok) {
                      throw new Error(
                        json.error?.message ??
                          "No se pudo quitar la credencial",
                      );
                    }
                    setMsg("Credencial eliminada.");
                    reload();
                  } catch (reason) {
                    setMsg(
                      reason instanceof Error
                        ? reason.message
                        : "No se pudo quitar la credencial",
                    );
                  }
                }}
              />
            )}
          </div>
        ))}
        {!rows.length && !loadError ? (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500">
            Todavía no conectaste credenciales propias. Podés agregar una arriba
            o usar las{" "}
            <Link
              href="/settings/connections"
              className="text-violet-700 hover:underline"
            >
              conexiones de Nexus
            </Link>
            .
          </p>
        ) : null}
      </div>
    </div>
  );
}
