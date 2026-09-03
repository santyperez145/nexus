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
  allowedModels: string[] | null;
  blockedModels: string[] | null;
};

export default function GuardrailsPage() {
  const [rows, reload] = useRemoteData<Guard[]>("/api/v1/guardrails");
  const [name, setName] = useState("Default");
  const [maxCost, setMaxCost] = useState("0.05");
  const [allowed, setAllowed] = useState("");
  const [blocked, setBlocked] = useState("");
  const list = rows ?? [];

  function parseList(raw: string) {
    return raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Guardrails</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Techo de costo, allow/block de modelos, prompt injection y secretos. El gateway corta antes del lab.
      </p>
      <div className="mb-4 grid gap-2 md:grid-cols-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" />
        <Input
          value={maxCost}
          onChange={(e) => setMaxCost(e.target.value)}
          placeholder="max USD"
        />
        <Input
          value={allowed}
          onChange={(e) => setAllowed(e.target.value)}
          placeholder="Allow prefixes: openai/,nexus/auto"
        />
        <Input
          value={blocked}
          onChange={(e) => setBlocked(e.target.value)}
          placeholder="Block substrings: :free,deepseek"
        />
      </div>
      <Button
        className="mb-6"
        onClick={async () => {
          const allow = parseList(allowed);
          const block = parseList(blocked);
          await fetch("/api/v1/guardrails", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              prompt_injection: true,
              sensitive_info: true,
              max_cost: maxCost ? Number(maxCost) : undefined,
              allowed_models: allow.length ? allow : undefined,
              blocked_models: block.length ? block : undefined,
            }),
          });
          setAllowed("");
          setBlocked("");
          reload();
        }}
      >
        Crear
      </Button>
      <div className="grid gap-2">
        {list.map((g) => (
          <div
            key={g.id}
            className="flex items-start justify-between gap-3 rounded-lg border border-white/10 px-3 py-2 text-sm"
          >
            <div>
              <div className="font-medium">{g.name}</div>
              <div className="mt-1 text-xs text-zinc-500">
                {g.promptInjection ? "injection · " : ""}
                {g.sensitiveInfo ? "secrets · " : ""}
                {g.maxCostMicros != null ? `max ${g.maxCostMicros / 1_000_000} USD` : "sin techo"}
              </div>
              {g.allowedModels?.length ? (
                <div className="mt-1 font-mono text-[11px] text-emerald-400/80">
                  allow: {g.allowedModels.join(", ")}
                </div>
              ) : null}
              {g.blockedModels?.length ? (
                <div className="mt-1 font-mono text-[11px] text-rose-400/80">
                  block: {g.blockedModels.join(", ")}
                </div>
              ) : null}
            </div>
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
