"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function OrgsPage() {
  const [name, setName] = useState("");
  const [rows, setRows] = useState<Array<{ id: string; name: string; slug: string }>>([]);

  async function load() {
    const res = await fetch("/api/v1/organization");
    const json = await res.json();
    setRows(json.data ?? []);
  }
  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Organizations</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Equipos, roles y workspaces compartidos.
      </p>
      <div className="mb-4 flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" />
        <Button
          onClick={async () => {
            await fetch("/api/v1/organization", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name }),
            });
            setName("");
            await load();
          }}
        >
          Crear
        </Button>
      </div>
      <div className="grid gap-2">
        {rows.map((o) => (
          <div key={o.id} className="rounded-lg border border-white/10 px-3 py-2 text-sm">
            {o.name} <span className="text-zinc-500">/{o.slug}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
