"use client";

import { AppPageHeader } from "@/components/layout/app-page-header";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRemoteData } from "@/lib/use-remote-data";

type Preset = { id: string; slug: string; config: Record<string, unknown> };

export default function PresetsPage() {
  const [rows, reload] = useRemoteData<Preset[]>("/api/v1/presets");
  const [slug, setSlug] = useState("default");
  const [model, setModel] = useState("nexus/auto");
  const [system, setSystem] = useState("");
  const [temperature, setTemperature] = useState("0.7");
  const [maxTokens, setMaxTokens] = useState("");
  const [providerOnly, setProviderOnly] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const list = rows ?? [];

  async function save() {
    const only = providerOnly
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    await fetch("/api/v1/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        model,
        system: system || undefined,
        temperature: temperature ? Number(temperature) : undefined,
        max_tokens: maxTokens ? Number(maxTokens) : undefined,
        provider: only.length ? { only } : undefined,
      }),
    });
    reload();
  }

  return (
    <div>
      <AppPageHeader title="Configuraciones reutilizables">
        Invocá una configuración con <code>@slug</code> o{" "}
        <code>nexus/preset/slug</code>. Los valores enviados en cada solicitud
        tienen prioridad sobre los guardados.
      </AppPageHeader>

      <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="mb-3 grid gap-2 md:grid-cols-2">
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="slug"
          />
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="modelo"
          />
          <Input
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
            placeholder="temperature"
          />
          <Input
            value={maxTokens}
            onChange={(e) => setMaxTokens(e.target.value)}
            placeholder="max_tokens"
          />
          <Input
            className="md:col-span-2"
            value={providerOnly}
            onChange={(e) => setProviderOnly(e.target.value)}
            placeholder="provider.only: groq,together"
          />
        </div>
        <Textarea
          value={system}
          onChange={(e) => setSystem(e.target.value)}
          placeholder="System prompt (opcional)"
          rows={3}
          className="mb-3"
        />
        <Button onClick={() => void save()}>Guardar preset</Button>
      </section>

      <div className="grid gap-3">
        {list.map((p) => {
          const cfg = p.config ?? {};
          const curl = `curl $NEXUS_URL/api/v1/chat/completions -H "Authorization: Bearer $NEXUS_API_KEY" -H "Content-Type: application/json" -d '{"model":"@${p.slug}","messages":[{"role":"user","content":"Hola"}]}'`;
          return (
            <div
              key={p.id}
              className="rounded-xl border border-zinc-200 px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-mono text-sm text-zinc-950/90">
                    @{p.slug}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {String(cfg.model ?? "—")}
                    {cfg.temperature != null
                      ? ` · temp ${cfg.temperature}`
                      : ""}
                    {cfg.max_tokens != null ? ` · max ${cfg.max_tokens}` : ""}
                    {cfg.system ? " · system" : ""}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button asChild size="sm" variant="outline">
                    <Link
                      href={`/chat?model=${encodeURIComponent(`@${p.slug}`)}`}
                    >
                      Probar
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await navigator.clipboard.writeText(`@${p.slug}`);
                      setCopied(p.id);
                    }}
                  >
                    {copied === p.id ? "Copiado" : "Copiar @"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await navigator.clipboard.writeText(curl);
                      setCopied(`curl-${p.id}`);
                    }}
                  >
                    {copied === `curl-${p.id}` ? "Curl ok" : "Curl"}
                  </Button>
                  <ConfirmAction
                    triggerLabel="Borrar"
                    title={`Borrar @${p.slug}`}
                    description="Las aplicaciones que usen esta configuración dejarán de encontrarla."
                    confirmLabel="Borrar configuración"
                    onConfirm={async () => {
                      await fetch(`/api/v1/presets?id=${p.id}`, {
                        method: "DELETE",
                      });
                      reload();
                    }}
                  />
                </div>
              </div>
              {typeof cfg.system === "string" && cfg.system ? (
                <pre className="mt-3 overflow-x-auto rounded-lg border border-zinc-100 bg-zinc-50 p-2 text-[11px] text-zinc-400">
                  {cfg.system}
                </pre>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
