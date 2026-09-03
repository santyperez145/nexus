"use client";

import { AppPageHeader } from "@/components/layout/app-page-header";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BYOK_FEE } from "@/lib/config";

type Lab = { name: string; label?: string; wired?: boolean };
type Row = { id: string; provider: string; label: string | null; created_at?: string };

export default function ByokPage() {
  const [provider, setProvider] = useState("openai");
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [labs, setLabs] = useState<Lab[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const reload = useCallback(() => {
    Promise.all([
      fetch("/api/v1/byok").then((r) => r.json()),
      fetch("/api/v1/providers").then((r) => r.json()),
    ]).then(([keys, providers]) => {
      setRows(keys.data ?? []);
      const list = (providers.data ?? []) as Lab[];
      setLabs(list);
      setProvider((current) =>
        list.some((l) => l.name === current) ? current : (list[0]?.name ?? current),
      );
    });
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    Promise.all([
      fetch("/api/v1/byok", { signal: ac.signal }).then((r) => r.json()),
      fetch("/api/v1/providers", { signal: ac.signal }).then((r) => r.json()),
    ]).then(([keys, providers]) => {
      if (ac.signal.aborted) return;
      setRows(keys.data ?? []);
      const list = (providers.data ?? []) as Lab[];
      setLabs(list);
      setProvider((current) =>
        list.some((l) => l.name === current) ? current : (list[0]?.name ?? current),
      );
    });
    return () => ac.abort();
  }, []);

  async function save() {
    setMsg(null);
    const res = await fetch("/api/v1/byok", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, key, label: label || undefined }),
    });
    const json = await res.json();
    setMsg(json.data ? "Key guardada (cifrada)." : json.error?.message ?? "error");
    setKey("");
    setLabel("");
    reload();
  }

  async function testRoute() {
    setPreview(null);
    const res = await fetch("/api/v1/routing/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "nexus/auto",
        provider: { only: [provider], allow_fallbacks: false },
        messages: [{ role: "user", content: "byok preview" }],
      }),
    });
    const json = await res.json();
    const hops = json.data?.hops ?? [];
    const wired = hops.filter((h: { wired?: boolean }) => h.wired).length;
    setPreview(
      json.data
        ? `mode=${json.data.mode} · hops=${hops.length} · wired=${wired} (incluye BYOK de sesión)`
        : json.error?.message ?? "preview error",
    );
  }

  const feePct = (BYOK_FEE * 100).toFixed(0);

  return (
    <div>
      <AppPageHeader title="BYOK">
        Traé tus keys de cualquier lab. Se cifran en reposo. Fee BYOK: {feePct}% sobre precio de lista
        (después del allowance). El router las usa cuando el pool no tiene ese adapter.
      </AppPageHeader>

      <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-zinc-400">
        Fee de carga de créditos ≠ fee BYOK. Inferencia pool = 0% markup.{" "}
        <Link href="/docs/limits" className="text-amber-400 hover:underline">
          Limits
        </Link>
      </div>

      <div className="mb-6 grid gap-2 md:grid-cols-2 lg:grid-cols-4">
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          aria-label="Proveedor"
          className="h-9 rounded-md border border-white/10 bg-zinc-950 px-3 text-sm"
        >
          {labs.map((l) => (
            <option key={l.name} value={l.name}>
              {l.label ?? l.name}
              {l.wired ? " · platform" : ""}
            </option>
          ))}
        </select>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (opcional)" />
        <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-..." type="password" />
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => void save()} disabled={!key.trim()}>
            Guardar
          </Button>
          <Button variant="outline" onClick={() => void testRoute()}>
            Preview
          </Button>
        </div>
      </div>
      {preview ? <p className="mb-4 font-mono text-xs text-zinc-500">{preview}</p> : null}
      {msg ? <p className="mb-4 text-sm text-amber-200/90">{msg}</p> : null}

      <div className="grid gap-2">
        {rows.map((r) => (
          <div
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm"
          >
            <div>
              <div className="font-mono text-amber-400/85">{r.provider}</div>
              <div className="text-xs text-zinc-500">
                {r.label ?? "—"}
                {r.created_at ? ` · ${new Date(r.created_at).toISOString().slice(0, 10)}` : ""}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await fetch(`/api/v1/byok?id=${r.id}`, { method: "DELETE" });
                reload();
              }}
            >
              Quitar
            </Button>
          </div>
        ))}
        {!rows.length ? (
          <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-zinc-500">
            Todavía no hay BYOK. Guardá una key o usá{" "}
            <Link href="/settings/connections" className="text-amber-400 hover:underline">
              Conexiones
            </Link>{" "}
            de plataforma.
          </p>
        ) : null}
      </div>
    </div>
  );
}
