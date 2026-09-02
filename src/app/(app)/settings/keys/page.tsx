"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type KeyRow = {
  id: string;
  hash: string;
  name: string;
  prefix: string;
  is_management: boolean;
  disabled: boolean;
};

export default function KeysPage() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [name, setName] = useState("Default");
  const [created, setCreated] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/v1/keys");
    const json = await res.json();
    setKeys(json.data ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function create(isManagement: boolean) {
    const res = await fetch("/api/v1/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, is_management: isManagement }),
    });
    const json = await res.json();
    setCreated(json.data?.key ?? null);
    await load();
  }

  async function remove(id: string) {
    await fetch(`/api/v1/keys?id=${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">API Keys</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Al registrarte ya se crea una key Default. El plaintext solo se muestra al crear.
      </p>
      <div className="mb-6 flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        <Button onClick={() => void create(false)}>Crear key</Button>
        <Button variant="outline" onClick={() => void create(true)}>
          Management
        </Button>
      </div>
      {created ? (
        <p className="mb-4 rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 font-mono text-sm">
          Cópiala ahora: {created}
        </p>
      ) : null}
      <div className="grid gap-2">
        {keys.map((k) => (
          <div key={k.id} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm">
            <span>
              {k.name}{" "}
              <span className="font-mono text-zinc-500">
                {k.prefix}… {k.is_management ? "mgmt" : "infer"}
              </span>
            </span>
            <Button variant="ghost" size="sm" onClick={() => void remove(k.id)}>
              Revocar
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
