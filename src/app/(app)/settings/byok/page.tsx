"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Lab = { name: string; label?: string };

export default function ByokPage() {
  const [provider, setProvider] = useState("openai");
  const [key, setKey] = useState("");
  const [labs, setLabs] = useState<Lab[]>([]);
  const [rows, setRows] = useState<Array<{ id: string; provider: string; label: string | null }>>([]);

  async function load() {
    const [keys, providers] = await Promise.all([
      fetch("/api/v1/byok").then((r) => r.json()),
      fetch("/api/v1/providers").then((r) => r.json()),
    ]);
    setRows(keys.data ?? []);
    const list = (providers.data ?? []) as Lab[];
    setLabs(list);
    if (list[0] && !list.some((l) => l.name === provider)) setProvider(list[0].name);
  }
  useEffect(() => {
    void load();
  }, []);

  async function save() {
    await fetch("/api/v1/byok", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, key }),
    });
    setKey("");
    await load();
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
            <span className="text-zinc-500">{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
