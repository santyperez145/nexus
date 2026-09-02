"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function GuardrailsPage() {
  const [name, setName] = useState("Default");
  const [rows, setRows] = useState<Array<{ id: string; name: string }>>([]);

  async function load() {
    const res = await fetch("/api/v1/guardrails");
    const json = await res.json();
    setRows(json.data ?? []);
  }
  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Guardrails</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Allow/block lists de modelos, techos de costo, detección de prompt injection y secretos.
      </p>
      <div className="mb-4 flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        <Button
          onClick={async () => {
            await fetch("/api/v1/guardrails", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name, prompt_injection: true, sensitive_info: true }),
            });
            await load();
          }}
        >
          Crear
        </Button>
      </div>
      <div className="grid gap-2">
        {rows.map((g) => (
          <div key={g.id} className="rounded-lg border border-white/10 px-3 py-2 text-sm">
            {g.name}
          </div>
        ))}
      </div>
    </div>
  );
}
