"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function WorkspacesPage() {
  const [name, setName] = useState("");
  const [rows, setRows] = useState<Array<{ id: string; name: string; slug: string }>>([]);

  async function load() {
    const res = await fetch("/api/v1/workspaces");
    const json = await res.json();
    setRows(json.data ?? []);
  }
  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Workspaces</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Separa proyectos, equipos y budgets. Cada API key puede anclarse a un workspace.
      </p>
      <div className="mb-4 flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" />
        <Button
          onClick={async () => {
            await fetch("/api/v1/workspaces", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name }),
            });
            setName("");
            await load();
          }}
        >
          Crear
        </Button>
      </div>
      <div className="grid gap-2">
        {rows.map((w) => (
          <div key={w.id} className="rounded-lg border border-white/10 px-3 py-2 text-sm">
            {w.name} <span className="text-zinc-500">/{w.slug}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
