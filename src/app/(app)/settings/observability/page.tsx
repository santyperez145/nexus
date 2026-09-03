"use client";

import { AppPageHeader } from "@/components/layout/app-page-header";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRemoteData } from "@/lib/use-remote-data";

type Dest = {
  id: string;
  name: string;
  type: string;
  config: { url?: string; has_secret?: boolean; secret?: string };
};

export default function ObservabilityPage() {
  const [rows, reload] = useRemoteData<Dest[]>("/api/v1/observability");
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const list = rows ?? [];

  return (
    <div>
      <AppPageHeader title="Observability">
        Webhook por generación. Firmamos con <code>x-nexus-signature</code> (HMAC-SHA256 del body).
      </AppPageHeader>
      <div className="mb-4 flex flex-wrap gap-2">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="min-w-[240px] flex-1" />
        <Button
          onClick={async () => {
            setMsg(null);
            const res = await fetch("/api/v1/observability", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url, name: "Webhook" }),
            });
            const json = await res.json();
            if (json.data?.revealed_secret) setRevealed(json.data.revealed_secret);
            setMsg(json.data ? "Webhook creado" : json.error?.message ?? "error");
            setUrl("");
            reload();
          }}
        >
          Agregar
        </Button>
      </div>
      {revealed ? (
        <p className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2 font-mono text-xs text-amber-100">
          Secret (una vez): {revealed}
        </p>
      ) : null}
      {msg ? <p className="mb-4 text-sm text-zinc-400">{msg}</p> : null}
      <div className="grid gap-2">
        {list.map((d) => (
          <div
            key={d.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <div className="truncate font-mono text-xs text-zinc-300">{d.config?.url ?? d.name}</div>
              <div className="mt-0.5 text-[11px] text-zinc-600">
                {d.config?.has_secret ? "HMAC on" : "sin secret"}
              </div>
            </div>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const res = await fetch("/api/v1/observability", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "ping", id: d.id }),
                  });
                  const json = await res.json();
                  setMsg(
                    json.data
                      ? `Ping → HTTP ${json.data.status}${json.data.ok ? " ok" : " fail"}`
                      : json.error?.message ?? "ping error",
                  );
                }}
              >
                Probar
              </Button>
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
          </div>
        ))}
      </div>
      <pre className="mt-8 overflow-x-auto rounded-xl border border-white/10 bg-black/30 p-3 text-[11px] text-zinc-500">
{`{
  "event": "generation.completed",
  "data": { "id": "gen-…", "model": "…", "provider": "…", "cost_micros": 0 }
}
// Header: x-nexus-signature = hex(hmac_sha256(secret, rawBody))`}
      </pre>
    </div>
  );
}
