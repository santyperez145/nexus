"use client";

import { AppPageHeader } from "@/components/layout/app-page-header";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Input } from "@/components/ui/input";
import { formatUsd } from "@/lib/money";
import { useRemoteData } from "@/lib/use-remote-data";

type Workspace = {
  id: string;
  name: string;
  slug: string;
  isDefault?: boolean;
  includeByokInBudgets?: boolean;
  organizationId?: string | null;
  can_manage?: boolean;
  member_ids?: string[];
  budget: { interval: string; limit: number; spent: number } | null;
};

type Organization = {
  id: string;
  name: string;
  role: string;
  members?: Array<{ userId: string; name: string; email: string; role: string }>;
};

export default function WorkspacesPage() {
  const [rows, reload] = useRemoteData<Workspace[]>("/api/v1/workspaces");
  const [organizations] = useRemoteData<Organization[]>("/api/v1/organization");
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("50");
  const [editId, setEditId] = useState<string | null>(null);
  const [editLimit, setEditLimit] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [memberDrafts, setMemberDrafts] = useState<Record<string, string[]>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const list = rows ?? [];

  return (
    <div>
      <AppPageHeader title="Espacios de trabajo">
        Separá proyectos, equipos y entornos con sus propias claves, accesos y límites de gasto.
      </AppPageHeader>
      <div className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-zinc-200 bg-white p-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" />
        <Input
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          placeholder="Límite USD"
          className="w-32"
          inputMode="decimal"
        />
        <select
          value={organizationId}
          onChange={(event) => setOrganizationId(event.target.value)}
          className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm"
          aria-label="Organización del espacio"
        >
          <option value="">Personal</option>
          {(organizations ?? [])
            .filter((organization) => organization.role === "owner" || organization.role === "admin")
            .map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
        </select>
        <Button
          onClick={async () => {
            const res = await fetch("/api/v1/workspaces", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name,
                limit: limit ? Number(limit) : undefined,
                organization_id: organizationId || undefined,
              }),
            });
            const json = await res.json();
            setMsg(json.data ? "Espacio creado" : json.error?.message ?? "No se pudo crear");
            setName("");
            reload();
          }}
        >
          Crear
        </Button>
      </div>
      {msg ? <p className="mb-4 text-sm text-zinc-700">{msg}</p> : null}
      <div className="grid gap-3">
        {list.map((w) => {
          const pct =
            w.budget && w.budget.limit > 0
              ? Math.min(100, (w.budget.spent / w.budget.limit) * 100)
              : 0;
          return (
            <div key={w.id} className="rounded-2xl border border-zinc-200 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-zinc-900">
                    {w.name}
                    {w.isDefault ? (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-violet-700">
                        predeterminado
                      </span>
                    ) : null}
                  </div>
                  <div className="font-mono text-xs text-zinc-600">/{w.slug}</div>
                  {w.organizationId ? (
                    <div className="mt-1 text-xs text-violet-700">Espacio compartido de la organización</div>
                  ) : null}
                </div>
                {w.can_manage !== false ? <div className="flex flex-wrap gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditId(w.id);
                      setEditLimit(String(w.budget?.limit ?? 50));
                    }}
                  >
                    Editar límite
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      await fetch("/api/v1/workspaces", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          id: w.id,
                          include_byok_in_budgets: !w.includeByokInBudgets,
                        }),
                      });
                      reload();
                    }}
                  >
                    Proveedores propios {w.includeByokInBudgets ? "incluidos" : "excluidos"}
                  </Button>
                  {!w.isDefault ? (
                    <ConfirmAction
                      triggerLabel="Borrar"
                      title={`Borrar ${w.name}`}
                      description="Este espacio de trabajo se eliminará y ya no podrá asignarse a nuevas claves."
                      confirmLabel="Borrar espacio"
                      onConfirm={async () => {
                        await fetch(`/api/v1/workspaces?id=${w.id}`, { method: "DELETE" });
                        reload();
                      }}
                    />
                  ) : null}
                </div> : <span className="text-xs text-zinc-500">Acceso como miembro</span>}
              </div>

              {w.budget ? (
                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between text-xs text-zinc-500">
                    <span>
                      {formatUsd(w.budget.spent, 4)} / {formatUsd(w.budget.limit, 2)} ·{" "}
                      {w.budget.interval === "monthly" ? "mensual" : w.budget.interval}
                    </span>
                    <span className="tabular-nums">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div
                      className={`h-full rounded-full ${pct >= 90 ? "bg-rose-400/70" : "bg-violet-400"}`}
                      style={{ width: `${Math.max(pct ? 3 : 0, pct)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs text-zinc-600">Sin límite de gasto para este espacio.</p>
              )}

              {w.organizationId && w.can_manage !== false ? (() => {
                const organization = organizations?.find((item) => item.id === w.organizationId);
                const assignable = organization?.members?.filter((member) => member.role === "member") ?? [];
                const selected = memberDrafts[w.id] ?? w.member_ids ?? [];
                return (
                  <div className="mt-4 border-t border-zinc-100 pt-4">
                    <div className="text-xs font-medium text-zinc-700">Acceso del equipo</div>
                    {w.isDefault ? (
                      <p className="mt-1 text-xs text-zinc-500">
                        El espacio predeterminado está disponible para todos los miembros de la organización.
                      </p>
                    ) : assignable.length ? (
                      <>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {assignable.map((member) => {
                            const checked = selected.includes(member.userId);
                            return (
                              <label
                                key={member.userId}
                                className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-700"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => {
                                    const next = event.target.checked
                                      ? [...new Set([...selected, member.userId])]
                                      : selected.filter((userId) => userId !== member.userId);
                                    setMemberDrafts((current) => ({ ...current, [w.id]: next }));
                                  }}
                                />
                                <span>{member.name || member.email}</span>
                              </label>
                            );
                          })}
                        </div>
                        <Button
                          className="mt-3"
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            const res = await fetch("/api/v1/workspaces", {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ id: w.id, member_ids: selected }),
                            });
                            const json = await res.json();
                            setMsg(json.data ? "Accesos actualizados" : json.error?.message ?? "No se pudo guardar");
                            if (json.data) {
                              setMemberDrafts((current) => {
                                const next = { ...current };
                                delete next[w.id];
                                return next;
                              });
                              reload();
                            }
                          }}
                        >
                          Guardar accesos
                        </Button>
                      </>
                    ) : (
                      <p className="mt-1 text-xs text-zinc-500">No hay miembros para asignar.</p>
                    )}
                  </div>
                );
              })() : null}

              {editId === w.id ? (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
                  <Input
                    value={editLimit}
                    onChange={(e) => setEditLimit(e.target.value)}
                    className="w-32"
                    inputMode="decimal"
                    aria-label="Nuevo límite USD"
                  />
                  <Button
                    size="sm"
                    onClick={async () => {
                      await fetch("/api/v1/workspaces", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: w.id, limit: Number(editLimit) }),
                      });
                      setEditId(null);
                      reload();
                    }}
                  >
                    Guardar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                    Cancelar
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
