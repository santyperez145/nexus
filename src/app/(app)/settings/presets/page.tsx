"use client";

import { AppPageHeader } from "@/components/layout/app-page-header";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRemoteData } from "@/lib/use-remote-data";

type Preset = { id: string; slug: string; config: Record<string, unknown> };

export default function PresetsPage() {
  const [rows, reload] = useRemoteData<Preset[]>("/api/v1/presets");
  const [slug, setSlug] = useState("default");
  const [model, setModel] = useState("nexus/auto");
  const list = rows ?? [];

  return (
    <div>
      <AppPageHeader title="Presets">
        Llamá un preset con <code>@slug</code> o <code>nexus/preset/slug</code>. El resto de campos del request pisan el preset.
      </AppPageHeader>
      <div className="mb-4 flex flex-wrap gap-2">
        <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug" className="w-40" />
        <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="modelo" />
        <Button
          onClick={async () => {
            await fetch("/api/v1/presets", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ slug, model }),
            });
            reload();
          }}
        >
          Guardar
        </Button>
      </div>
      <div className="grid gap-2">
        {list.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 font-mono text-sm">
            <span>
              @{p.slug} → {String(p.config.model ?? "—")}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await fetch(`/api/v1/presets?id=${p.id}`, { method: "DELETE" });
                reload();
              }}
            >
              Borrar
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
