"use client";

import { AppPageHeader } from "@/components/layout/app-page-header";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
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
  allowedProviders: string[] | null;
  enforceZdr: boolean;
};

type ModelRow = { id: string };
type ProviderRow = { name: string; label: string };

function ChipField({
  label,
  values,
  onChange,
  tone,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  tone: "allow" | "block";
}) {
  const [draft, setDraft] = useState("");
  const chip =
    tone === "allow"
      ? "border-emerald-500/40 bg-emerald-50 text-emerald-700"
      : "border-rose-500/40 bg-rose-50 text-rose-700";

  function add() {
    const parts = draft
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    onChange([...new Set([...values, ...parts])]);
    setDraft("");
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {values.map((v) => (
          <button
            key={v}
            type="button"
            className={`rounded border px-2 py-0.5 font-mono text-[11px] ${chip}`}
            onClick={() => onChange(values.filter((x) => x !== v))}
            title="Quitar"
          >
            {v} ×
          </button>
        ))}
        {values.length === 0 ? <span className="text-xs text-zinc-600">vacío</span> : null}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={tone === "allow" ? "openai/, nexus/auto" : ":free, deepseek"}
          className="font-mono text-xs"
        />
        <Button type="button" variant="outline" size="sm" onClick={add}>
          +
        </Button>
      </div>
    </div>
  );
}

function passes(id: string, allow: string[], block: string[]) {
  if (block.some((b) => id.includes(b))) return false;
  if (!allow.length) return true;
  return allow.some((a) => id.startsWith(a) || id.includes(a));
}

export default function GuardrailsPage() {
  const [rows, reload] = useRemoteData<Guard[]>("/api/v1/guardrails");
  const [models] = useRemoteData<ModelRow[]>("/api/v1/models");
  const [providers] = useRemoteData<ProviderRow[]>("/api/v1/providers");
  const [name, setName] = useState("Default");
  const [maxCost, setMaxCost] = useState("0.05");
  const [allowed, setAllowed] = useState<string[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [allowedProviders, setAllowedProviders] = useState<string[]>([]);
  const [promptInjection, setPromptInjection] = useState(true);
  const [sensitiveInfo, setSensitiveInfo] = useState(true);
  const [enforceZdr, setEnforceZdr] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const list = rows ?? [];

  const modelIds = useMemo(() => (models ?? []).map((m) => m.id), [models]);

  const matchCount = useMemo(() => {
    if (!modelIds.length) return null;
    return modelIds.filter((id) => passes(id, allowed, blocked)).length;
  }, [modelIds, allowed, blocked]);

  const samples = useMemo(() => {
    if (!modelIds.length) return [] as string[];
    return modelIds.filter((id) => passes(id, allowed, blocked)).slice(0, 6);
  }, [modelIds, allowed, blocked]);

  return (
    <div>
      <AppPageHeader title="Guardrails">
        Techo de costo, allow/block de modelos, prompt injection y secretos. El gateway corta antes del
        lab. Preview abajo usa el catálogo vivo de esta instancia.
      </AppPageHeader>
      <div className="mb-4 grid gap-2 md:grid-cols-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" />
        <Input
          value={maxCost}
          onChange={(e) => setMaxCost(e.target.value)}
          placeholder="max USD"
        />
      </div>
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <ChipField label="Allow prefixes" values={allowed} onChange={setAllowed} tone="allow" />
        <ChipField label="Block substrings" values={blocked} onChange={setBlocked} tone="block" />
        <ChipField label="Proveedores permitidos" values={allowedProviders} onChange={setAllowedProviders} tone="allow" />
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <div className="text-xs uppercase tracking-wide text-zinc-500">Controles obligatorios</div>
          <div className="mt-3 grid gap-2 text-sm text-zinc-700">
            <label className="flex items-center gap-2"><input type="checkbox" checked={promptInjection} onChange={(event) => setPromptInjection(event.target.checked)} /> Bloquear inyección básica</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={sensitiveInfo} onChange={(event) => setSensitiveInfo(event.target.checked)} /> Bloquear credenciales sensibles</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={enforceZdr} onChange={(event) => setEnforceZdr(event.target.checked)} /> Exigir Zero Data Retention</label>
          </div>
          {providers?.length ? <p className="mt-3 text-[11px] text-zinc-500">IDs disponibles: {providers.map((provider) => provider.name).join(", ")}</p> : null}
        </div>
      </div>
      {matchCount != null ? (
        <div className="mb-4 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-400">
          <span className="text-zinc-800">{matchCount}</span> / {modelIds.length} modelos pasarían
          esta policy.
          {samples.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-[11px] text-zinc-500">
              {samples.map((id) => (
                <span key={id} className="rounded border border-zinc-200 px-1.5 py-0.5">
                  {id}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-xs text-rose-300/80">Ningún slug del catálogo matchea.</p>
          )}
        </div>
      ) : null}
      <Button
        className="mb-6"
        onClick={async () => {
          setMessage(null);
          const response = await fetch("/api/v1/guardrails", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              prompt_injection: promptInjection,
              sensitive_info: sensitiveInfo,
              enforce_zdr: enforceZdr,
              max_cost: maxCost ? Number(maxCost) : undefined,
              allowed_models: allowed.length ? allowed : undefined,
              blocked_models: blocked.length ? blocked : undefined,
              allowed_providers: allowedProviders.length ? allowedProviders : undefined,
            }),
          });
          const payload = await response.json();
          if (!response.ok) {
            setMessage(payload.error?.message ?? payload.error ?? "No se pudo crear la regla");
            return;
          }
          setAllowed([]);
          setBlocked([]);
          setAllowedProviders([]);
          setMessage("Guardrail creado y activo.");
          reload();
        }}
      >
        Crear
      </Button>
      <div aria-live="polite" className="mb-4 min-h-5 text-xs text-zinc-600">{message}</div>
      <div className="grid gap-2">
        {list.map((g) => (
          <div
            key={g.id}
            className="flex items-start justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          >
            <div>
              <div className="font-medium">{g.name}</div>
              <div className="mt-1 text-xs text-zinc-500">
                {g.promptInjection ? "injection · " : ""}
                {g.sensitiveInfo ? "secrets · " : ""}
                {g.enforceZdr ? "ZDR · " : ""}
                {g.maxCostMicros != null ? `max ${g.maxCostMicros / 1_000_000} USD` : "sin techo"}
              </div>
              {g.allowedModels?.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {g.allowedModels.map((m) => (
                    <span
                      key={m}
                      className="rounded border border-emerald-500/30 bg-emerald-50 px-1.5 py-0.5 font-mono text-[11px] text-emerald-700"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              ) : null}
              {g.blockedModels?.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {g.blockedModels.map((m) => (
                    <span
                      key={m}
                      className="rounded border border-rose-500/30 bg-rose-50 px-1.5 py-0.5 font-mono text-[11px] text-rose-700"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              ) : null}
              {g.allowedProviders?.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {g.allowedProviders.map((provider) => (
                    <span key={provider} className="rounded border border-violet-300 bg-violet-50 px-1.5 py-0.5 font-mono text-[11px] text-violet-700">provider:{provider}</span>
                  ))}
                </div>
              ) : null}
            </div>
            <ConfirmAction
              triggerLabel="Quitar"
              title={`Quitar ${g.name}`}
              description="Esta regla dejará de proteger las solicitudes asociadas."
              confirmLabel="Quitar regla"
              onConfirm={async () => {
                await fetch(`/api/v1/guardrails?id=${g.id}`, { method: "DELETE" });
                reload();
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
