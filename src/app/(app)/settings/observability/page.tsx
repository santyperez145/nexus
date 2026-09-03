"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRemoteData } from "@/lib/use-remote-data";

type Dest = { id: string; name: string; type: string; config: { url?: string } };

export default function ObservabilityPage() {
  const [rows, reload] = useRemoteData<Dest[]>("/api/v1/observability");
  const [url, setUrl] = useState("");
  const list = rows ?? [];

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Observability</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Webhook por generación completada. POST JSON <code>generation.completed</code>.
      </p>
      <div className="mb-4 flex gap-2">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        <Button
          onClick={async () => {
            await fetch("/api/v1/observability", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url, name: "Webhook" }),
            });
            setUrl("");
            reload();
          }}
        >
          Agregar
        </Button>
      </div>
      <div className="grid gap-2">
        {list.map((d) => (
          <div key={d.id} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm">
            <span className="font-mono text-xs">{d.config?.url ?? d.name}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await fetch(`/api/v1/observability?id=${d.id}`, { method: "DELETE" });
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
