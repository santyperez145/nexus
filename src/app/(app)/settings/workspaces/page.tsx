"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUsd } from "@/lib/money";
import { useRemoteData } from "@/lib/use-remote-data";

type Workspace = {
  id: string;
  name: string;
  slug: string;
  budget: { interval: string; limit: number; spent: number } | null;
};

export default function WorkspacesPage() {
  const [rows, reload] = useRemoteData<Workspace[]>("/api/v1/workspaces");
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("50");
  const list = rows ?? [];

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Workspaces</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Separa proyectos y budgets mensuales. Las keys pueden anclarse a un workspace; el gateway corta al superar el límite.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
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
      <div className="grid gap-2">
        {list.map((w) => (
          <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm">
            <span>
              {w.name} <span className="text-zinc-500">/{w.slug}</span>
              <span className="mt-1 block text-xs text-zinc-500">
                {w.budget
                  ? `${formatUsd(w.budget.spent, 4)} / ${formatUsd(w.budget.limit, 2)} · ${w.budget.interval}`
                  : "sin budget"}
              </span>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const next = window.prompt("Budget USD mensual", String(w.budget?.limit ?? 50));
                if (!next) return;
                await fetch("/api/v1/workspaces", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id: w.id, limit: Number(next) }),
                });
                reload();
              }}
            >
              Budget
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
