"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Lab = { name: string; label?: string };
type Row = { id: string; provider: string; label: string | null };

export default function ByokPage() {
  const [provider, setProvider] = useState("openai");
  const [key, setKey] = useState("");
  const [labs, setLabs] = useState<Lab[]>([]);
  const [rows, setRows] = useState<Row[]>([]);

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
    await fetch("/api/v1/byok", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, key }),
    });
    setKey("");
    reload();
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">BYOK</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Traé tus keys de cualquier lab cableado. Se cifran en reposo. El router las usa cuando el
        pool de la plataforma no tiene ese adapter. Fee BYOK: 5% sobre el precio de lista después
        del allowance mensual.
      </p>
      <div className="mb-6 grid gap-2 md:grid-cols-3">
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          aria-label="Proveedor"
          className="h-9 rounded-md border border-white/10 bg-zinc-950 px-3 text-sm"
        >
          {labs.map((l) => (
            <option key={l.name} value={l.name}>
              {l.label ?? l.name}
            </option>
          ))}
        </select>
        <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-..." type="password" />
        <Button onClick={() => void save()}>Guardar</Button>
      </div>
      <div className="grid gap-2">
        {rows.map((r) => (
          <div key={r.id} className="flex justify-between rounded-lg border border-white/10 px-3 py-2 text-sm">
            <span>{r.provider}</span>
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
      </div>
    </div>
  );
}
