"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRemoteData } from "@/lib/use-remote-data";

type Guard = {
  id: string;
  name: string;
  maxCostMicros: number | null;
  promptInjection: boolean;
  sensitiveInfo: boolean;
};

export default function GuardrailsPage() {
  const [rows, reload] = useRemoteData<Guard[]>("/api/v1/guardrails");
  const [name, setName] = useState("Default");
  const [maxCost, setMaxCost] = useState("0.05");
  const list = rows ?? [];

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Guardrails</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Techo de costo por request, prompt injection y secretos. El gateway corta antes de llamar al lab.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          value={maxCost}
          onChange={(e) => setMaxCost(e.target.value)}
          placeholder="max USD"
          className="w-28"
        />
        <Button
          onClick={async () => {
            await fetch("/api/v1/guardrails", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name,
                prompt_injection: true,
                sensitive_info: true,
                max_cost: maxCost ? Number(maxCost) : undefined,
              }),
            });
            reload();
          }}
        >
          Crear
        </Button>
      </div>
      <div className="grid gap-2">
        {list.map((g) => (
          <div key={g.id} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm">
            <span>
              {g.name}
              <span className="ml-2 text-xs text-zinc-500">
                {g.promptInjection ? "injection " : ""}
                {g.sensitiveInfo ? "secrets " : ""}
                {g.maxCostMicros != null ? `max ${g.maxCostMicros / 1_000_000} USD` : ""}
              </span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await fetch(`/api/v1/guardrails?id=${g.id}`, { method: "DELETE" });
                reload();
              }}
            >
              Quitar
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
