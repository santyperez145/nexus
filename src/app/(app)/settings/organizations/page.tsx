"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRemoteData } from "@/lib/use-remote-data";

type Member = { id: string; userId: string; role: string; email: string; name: string };
type Org = { id: string; name: string; slug: string; role: string; ownerId: string; members: Member[] };

export default function OrgsPage() {
  const [rows, reload] = useRemoteData<Org[]>("/api/v1/organization");
  const [name, setName] = useState("");
  const [invite, setInvite] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const list = rows ?? [];

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Organizations</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Equipos y miembros. El invite busca un usuario ya registrado por email.
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
            reload();
          }}
        >
          Crear
        </Button>
      </div>
      {msg ? <p className="mb-4 text-sm text-amber-300">{msg}</p> : null}
      <div className="grid gap-3">
        {list.map((o) => (
          <div key={o.id} className="rounded-lg border border-white/10 px-3 py-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span>
                {o.name} <span className="text-zinc-500">/{o.slug} · {o.role}</span>
              </span>
              {o.role === "owner" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await fetch(`/api/v1/organization?id=${o.id}`, { method: "DELETE" });
                    reload();
                  }}
                >
                  Borrar
                </Button>
              ) : null}
            </div>
            <div className="mt-2 text-xs text-zinc-500">
              {o.members?.map((m) => (
                <div key={m.id}>
                  {m.email} · {m.role}
                </div>
              ))}
            </div>
            {o.role === "owner" ? (
              <div className="mt-3 flex gap-2">
                <Input
                  value={invite}
                  onChange={(e) => setInvite(e.target.value)}
                  placeholder="email a invitar"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const res = await fetch("/api/v1/organization", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ organization_id: o.id, invite_email: invite }),
                    });
                    const json = await res.json();
                    setMsg(json.data ? `Invitado ${json.data.email}` : json.error?.message ?? "error");
                    setInvite("");
                    reload();
                  }}
                >
                  Invitar
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
