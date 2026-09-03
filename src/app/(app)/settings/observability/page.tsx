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
  const [name, setName] = useState("Webhook");
  const [msg, setMsg] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [lastPing, setLastPing] = useState<Record<string, string>>({});
  const list = rows ?? [];

  return (
    <div>
      <AppPageHeader title="Observability">
        Webhook por generación. Firmamos con <code>x-nexus-signature</code> (HMAC-SHA256 del body).
        Ping: <code>POST {"{ action: \"ping\", id }"}</code>.
      </AppPageHeader>
      <div className="mb-4 grid gap-2 md:grid-cols-[1fr_10rem_auto]">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" />
        <Button
          onClick={async () => {
            setMsg(null);
            const res = await fetch("/api/v1/observability", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url, name: name || "Webhook" }),
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
        <div className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2">
          <div className="mb-1 flex items-center justify-between gap-2 text-xs text-amber-200/90">
            <span>Secret (una vez)</span>
            <button
              type="button"
              className="text-amber-400 hover:underline"
              onClick={() => void navigator.clipboard.writeText(revealed)}
            >
              Copiar
            </button>
          </div>
          <pre className="overflow-x-auto font-mono text-xs text-amber-100">{revealed}</pre>
        </div>
      ) : null}
      {msg ? <p className="mb-4 text-sm text-zinc-400">{msg}</p> : null}
      <div className="grid gap-2">
        {list.map((d) => (
          <div
            key={d.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <div className="font-medium text-zinc-200">{d.name}</div>
              <div className="truncate font-mono text-xs text-zinc-400">{d.config?.url}</div>
              <div className="mt-0.5 text-[11px] text-zinc-600">
                {d.config?.has_secret ? "HMAC on" : "sin secret"}
                {lastPing[d.id] ? ` · last ping ${lastPing[d.id]}` : ""}
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
                  const line = json.data
                    ? `HTTP ${json.data.status}${json.data.ok ? " ok" : " fail"}`
                    : json.error?.message ?? "error";
                  setLastPing((prev) => ({ ...prev, [d.id]: line }));
                  setMsg(json.data ? `Ping → ${line}` : line);
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
        {!list.length ? (
          <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-zinc-500">
            Sin webhooks. Agregá una URL para recibir generation.completed firmados.
          </p>
        ) : null}
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
