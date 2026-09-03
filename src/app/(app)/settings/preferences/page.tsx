"use client";

import { AppPageHeader } from "@/components/layout/app-page-header";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRemoteData } from "@/lib/use-remote-data";

type Prefs = { defaultModel: string };

export default function PreferencesPage() {
  const [prefs] = useRemoteData<Prefs>("/api/internal/preferences");
  const [defaultModel, setDefaultModel] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const value = defaultModel || prefs?.defaultModel || "nexus/auto";

  async function save() {
    const res = await fetch("/api/internal/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultModel: value }),
    });
    const json = await res.json();
    setMsg(json.ok ? "Guardado" : json.error);
  }

  return (
    <div>
      <AppPageHeader title="Preferences">
        Modelo por defecto del playground. Variantes <code>:fast :cheap :quality :free :online</code>.
      </AppPageHeader>
      <div className="flex max-w-xl gap-2">
        <Input value={value} onChange={(e) => setDefaultModel(e.target.value)} />
        <Button onClick={() => void save()}>Guardar</Button>
      </div>
      {msg ? <p className="mt-3 text-sm text-amber-300">{msg}</p> : null}
    </div>
  );
}
