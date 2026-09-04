"use client";

import Link from "next/link";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRemoteData } from "@/lib/use-remote-data";
import {
  DEFAULT_ROUTING_PREFS,
  useRoutingPrefs,
  type RoutingPrefs,
} from "@/lib/use-routing-prefs";

type Prefs = { defaultModel: string; zdr?: boolean; allowTraining?: boolean };

const VARIANTS = [":fast", ":cheap", ":quality", ":free", ":online"] as const;
const SUGGESTIONS = [
  "nexus/auto",
  "nexus/free",
  "openai/gpt-4o-mini",
  "anthropic/claude-haiku-4.5",
];

function baseSlug(model: string) {
  return model.replace(/:(fast|cheap|quality|free|online)$/i, "");
}

export default function PreferencesPage() {
  const [prefs] = useRemoteData<Prefs>("/api/internal/preferences");
  const [defaultModel, setDefaultModel] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [routing, setRoutingPrefs] = useRoutingPrefs();
  const [onlyDraft, setOnlyDraft] = useState<string | null>(null);
  const [ignoreDraft, setIgnoreDraft] = useState<string | null>(null);
  const value = defaultModel || prefs?.defaultModel || "nexus/auto";
  const base = baseSlug(value);
  const onlyValue = onlyDraft ?? routing.only;
  const ignoreValue = ignoreDraft ?? routing.ignore;

  async function save(next = value) {
    const res = await fetch("/api/internal/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultModel: next }),
    });
    const json = await res.json();
    setMsg(json.ok ? "Modelo guardado" : json.error);
  }

  function applyVariant(v: (typeof VARIANTS)[number]) {
    const next = `${base}${v}`;
    setDefaultModel(next);
    void save(next);
  }

  function saveRouting(next: RoutingPrefs) {
    setRoutingPrefs(next);
    setOnlyDraft(null);
    setIgnoreDraft(null);
    setMsg("Routing defaults guardados (playground)");
  }

  return (
    <div>
      <AppPageHeader title="Preferencias">
        Elegí el modelo inicial y las reglas de enrutamiento que usarán Chat y
        el Estudio de forma predeterminada, incluidos respaldo entre proveedores
        y privacidad ZDR.
      </AppPageHeader>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-zinc-900">
          Modelo por defecto
        </h2>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setDefaultModel(s);
                void save(s);
              }}
              className={`rounded-full border px-3 py-1 font-mono text-xs ${
                base === s
                  ? "border-violet-300 bg-violet-50 text-zinc-700"
                  : "border-zinc-200 text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {VARIANTS.map((v) => {
            const active = value.endsWith(v);
            return (
              <button
                key={v}
                type="button"
                onClick={() => applyVariant(v)}
                className={`rounded-md border px-2.5 py-1 font-mono text-xs ${
                  active
                    ? "border-violet-300 text-zinc-700"
                    : "border-zinc-200 text-zinc-500 hover:text-zinc-800"
                }`}
              >
                {v}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setDefaultModel(base);
              void save(base);
            }}
            className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-500 hover:text-zinc-800"
          >
            sin variante
          </button>
        </div>

        <div className="flex max-w-xl gap-2">
          <Input
            value={value}
            onChange={(e) => setDefaultModel(e.target.value)}
            aria-label="Modelo default"
          />
          <Button onClick={() => void save()}>Guardar</Button>
        </div>
        <div className="mt-3">
          <Button asChild size="sm" variant="outline">
            <Link href={`/chat?model=${encodeURIComponent(value)}`}>
              Usar en playground
            </Link>
          </Button>
        </div>
      </section>

      <section className="mb-8 max-w-xl">
        <h2 className="mb-1 text-lg font-semibold text-zinc-900">
          Routing defaults
        </h2>
        <p className="mb-4 text-sm text-zinc-500">
          Se aplican al abrir Chat en este dispositivo. Privacy de cuenta (ZDR /
          training) sigue en{" "}
          <Link
            href="/settings/privacy"
            className="text-violet-700 hover:underline"
          >
            Privacy
          </Link>
          .
        </p>

        <label className="mb-3 block text-sm text-zinc-400">
          Sort
          <select
            className="mt-1 h-9 w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900"
            value={routing.sort}
            onChange={(e) =>
              saveRouting({
                ...routing,
                sort: e.target.value as RoutingPrefs["sort"],
              })
            }
          >
            <option value="default">default (catálogo)</option>
            <option value="price">price</option>
            <option value="throughput">throughput</option>
            <option value="latency">latency</option>
          </select>
        </label>

        <div className="mb-3 flex flex-wrap gap-4 text-sm text-zinc-600">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={routing.allowFallbacks}
              onChange={(e) =>
                saveRouting({ ...routing, allowFallbacks: e.target.checked })
              }
            />
            allow_fallbacks
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={routing.zdrOnly}
              onChange={(e) =>
                saveRouting({ ...routing, zdrOnly: e.target.checked })
              }
            />
            ZDR only
          </label>
        </div>

        <label className="mb-3 block text-sm text-zinc-400">
          provider.only (csv)
          <Input
            className="mt-1"
            value={onlyValue}
            onChange={(e) => setOnlyDraft(e.target.value)}
            onBlur={() => saveRouting({ ...routing, only: onlyValue })}
            placeholder="groq,together"
          />
        </label>
        <label className="mb-4 block text-sm text-zinc-400">
          provider.ignore (csv)
          <Input
            className="mt-1"
            value={ignoreValue}
            onChange={(e) => setIgnoreDraft(e.target.value)}
            onBlur={() => saveRouting({ ...routing, ignore: ignoreValue })}
            placeholder="deepseek"
          />
        </label>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => saveRouting(DEFAULT_ROUTING_PREFS)}
        >
          Reset routing
        </Button>
      </section>

      {msg ? <p className="text-sm text-zinc-950">{msg}</p> : null}
    </div>
  );
}
