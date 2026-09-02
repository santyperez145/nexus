"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function PreferencesPage() {
  const [defaultModel, setDefaultModel] = useState("nexus/auto");
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    const res = await fetch("/api/internal/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultModel }),
    });
    const json = await res.json();
    setMsg(json.ok ? "Guardado" : json.error);
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Preferences</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Modelo por defecto y variantes <code>:fast :cheap :quality :free :online</code>. Auto top-up
        está en Credits.
      </p>
      <div className="flex max-w-xl gap-2">
        <Input value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)} />
        <Button onClick={() => void save()}>Guardar</Button>
      </div>
      {msg ? <p className="mt-3 text-sm text-amber-300">{msg}</p> : null}
    </div>
  );
}
