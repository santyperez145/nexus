"use client";

import { AppPageHeader } from "@/components/layout/app-page-header";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUsd } from "@/lib/money";
import { useRemoteData } from "@/lib/use-remote-data";

type Workspace = {
  id: string;
  name: string;
  slug: string;
  isDefault?: boolean;
  includeByokInBudgets?: boolean;
  budget: { interval: string; limit: number; spent: number } | null;
};

export default function WorkspacesPage() {
  const [rows, reload] = useRemoteData<Workspace[]>("/api/v1/workspaces");
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("50");
  const [editId, setEditId] = useState<string | null>(null);
  const [editLimit, setEditLimit] = useState("");
  const list = rows ?? [];

  return (
    <div>
      <AppPageHeader title="Workspaces">
        Separa proyectos y budgets. Las keys pueden anclarse a un workspace; el gateway corta al
        superar el límite.
      </AppPageHeader>
      <div className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" />
        <Input
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          placeholder="Budget USD"
          className="w-32"
          inputMode="decimal"
        />
        <Button
          onClick={async () => {
            await fetch("/api/v1/workspaces", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name, limit: limit ? Number(limit) : undefined }),
            });
            setName("");
            reload();
          }}
        >
          Crear
        </Button>
      </div>
      <div className="grid gap-3">
        {list.map((w) => {
          const pct =
            w.budget && w.budget.limit > 0
              ? Math.min(100, (w.budget.spent / w.budget.limit) * 100)
              : 0;
          return (
            <div key={w.id} className="rounded-2xl border border-white/10 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-[family-name:var(--font-syne)] text-lg font-semibold text-zinc-100">
                    {w.name}
                    {w.isDefault ? (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-500/80">
                        default
                      </span>
                    ) : null}
                  </div>
                  <div className="font-mono text-xs text-zinc-600">/{w.slug}</div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditId(w.id);
                      setEditLimit(String(w.budget?.limit ?? 50));
                    }}
                  >
                    Editar budget
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
                    BYOK {w.includeByokInBudgets ? "en budget" : "fuera"}
                  </Button>
                  {!w.isDefault ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        await fetch(`/api/v1/workspaces?id=${w.id}`, { method: "DELETE" });
                        reload();
                      }}
                    >
                      Borrar
                    </Button>
                  ) : null}
                </div>
              </div>

              {w.budget ? (
                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between text-xs text-zinc-500">
                    <span>
                      {formatUsd(w.budget.spent, 4)} / {formatUsd(w.budget.limit, 2)} ·{" "}
                      {w.budget.interval}
                    </span>
                    <span className="tabular-nums">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div
                      className={`h-full rounded-full ${pct >= 90 ? "bg-rose-400/70" : "bg-amber-400/60"}`}
                      style={{ width: `${Math.max(pct ? 3 : 0, pct)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs text-zinc-600">Sin budget — el gasto no se corta por workspace.</p>
              )}

              {editId === w.id ? (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-white/5 pt-3">
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
