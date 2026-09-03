"use client";

import Link from "next/link";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRemoteData } from "@/lib/use-remote-data";

type Prefs = { defaultModel: string };

const VARIANTS = [":fast", ":cheap", ":quality", ":free", ":online"] as const;
const SUGGESTIONS = ["nexus/auto", "nexus/free", "openai/gpt-4o-mini", "anthropic/claude-haiku-4.5"];

function baseSlug(model: string) {
  return model.replace(/:(fast|cheap|quality|free|online)$/i, "");
}

export default function PreferencesPage() {
  const [prefs] = useRemoteData<Prefs>("/api/internal/preferences");
  const [defaultModel, setDefaultModel] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const value = defaultModel || prefs?.defaultModel || "nexus/auto";
  const base = baseSlug(value);

  async function save(next = value) {
    const res = await fetch("/api/internal/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultModel: next }),
    });
    const json = await res.json();
    setMsg(json.ok ? "Guardado" : json.error);
  }

  function applyVariant(v: (typeof VARIANTS)[number]) {
    const next = `${base}${v}`;
    setDefaultModel(next);
    void save(next);
  }

  return (
    <div>
      <AppPageHeader title="Preferences">
        Modelo por defecto del playground. Variantes{" "}
        <code className="text-zinc-400">:fast :cheap :quality :free :online</code>.
      </AppPageHeader>

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
                ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
                : "border-white/10 text-zinc-500 hover:text-zinc-300"
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
                  ? "border-amber-400/40 text-amber-200"
                  : "border-white/10 text-zinc-500 hover:text-zinc-300"
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
          className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-zinc-500 hover:text-zinc-300"
        >
          sin variante
        </button>
      </div>

      <div className="flex max-w-xl gap-2">
        <Input value={value} onChange={(e) => setDefaultModel(e.target.value)} aria-label="Modelo default" />
        <Button onClick={() => void save()}>Guardar</Button>
      </div>

      <div className="mt-4">
        <Button asChild size="sm" variant="outline">
          <Link href={`/chat?model=${encodeURIComponent(value)}`}>Usar en playground</Link>
        </Button>
      </div>
      {msg ? <p className="mt-3 text-sm text-amber-300">{msg}</p> : null}
    </div>
  );
}
