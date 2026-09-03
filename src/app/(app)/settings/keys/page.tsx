"use client";

import { AppPageHeader } from "@/components/layout/app-page-header";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUsd } from "@/lib/money";
import { useRemoteData } from "@/lib/use-remote-data";

type KeyRow = {
  id: string;
  hash: string;
  name: string;
  prefix: string;
  is_management: boolean;
  disabled: boolean;
  last_used: string | null;
  usage: number;
  limit: number | null;
  workspace_id: string | null;
};

type Workspace = { id: string; name: string; slug: string; isDefault?: boolean };

function KeysInner() {
  const params = useSearchParams();
  const welcome = params.get("welcome") === "1";
  const [keys, reload] = useRemoteData<KeyRow[]>("/api/v1/keys");
  const [workspaces] = useRemoteData<Workspace[]>("/api/v1/workspaces");
  const [name, setName] = useState("SDK");
  const [limit, setLimit] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [welcomeNote, setWelcomeNote] = useState<string | null>(null);
  const [curl, setCurl] = useState<string | null>(null);
  const revealing = useRef(false);
  const rows = keys ?? [];
  const spaces = workspaces ?? [];

  useEffect(() => {
    if (!welcome || created || revealing.current) return;
    revealing.current = true;
    const ac = new AbortController();
    fetch("/api/internal/keys/welcome", { method: "POST", signal: ac.signal })
      .then((r) => r.json())
      .then((json) => {
        if (ac.signal.aborted) return;
        if (json.data?.key) {
          setCreated(json.data.key);
          setCurl(json.data.curl ?? null);
          setWelcomeNote(json.data.note ?? "Key de bienvenida — copiá ahora.");
          reload();
          window.history.replaceState({}, "", "/settings/keys");
        } else if (json.error) {
          setWelcomeNote(json.error);
          window.history.replaceState({}, "", "/settings/keys");
        }
      })
      .catch(() => undefined);
    return () => ac.abort();
  }, [welcome, created, reload]);

  async function create(isManagement: boolean) {
    const res = await fetch("/api/v1/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        is_management: isManagement,
        limit: limit ? Number(limit) : undefined,
        workspace_id: workspaceId || undefined,
      }),
    });
    const json = await res.json();
    setCreated(json.data?.key ?? null);
    setWelcomeNote(null);
    reload();
  }

  async function rotate(id: string) {
    const res = await fetch("/api/v1/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rotate_id: id }),
    });
    const json = await res.json();
    setCreated(json.data?.key ?? null);
    setWelcomeNote(null);
    reload();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch("/api/v1/keys", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    reload();
  }

  async function remove(id: string) {
    await fetch(`/api/v1/keys?id=${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div>
      <AppPageHeader title="API Keys">
        El plaintext solo se muestra al crear, rotar o al revelar la de bienvenida. Anclá la key a un workspace para que el budget corte.
      </AppPageHeader>
      {welcomeNote ? <p className="mb-3 text-sm text-amber-300">{welcomeNote}</p> : null}
      <div className="mb-6 flex flex-wrap gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" />
        <Input
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          placeholder="Límite USD"
          className="w-32"
          inputMode="decimal"
        />
        <select
          value={workspaceId}
          onChange={(e) => setWorkspaceId(e.target.value)}
          className="h-9 rounded-md border border-white/10 bg-zinc-950 px-3 text-sm"
          aria-label="Workspace"
        >
          <option value="">Sin workspace</option>
          {spaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <Button onClick={() => void create(false)}>Crear key</Button>
        <Button variant="outline" onClick={() => void create(true)}>
          Management
        </Button>
      </div>
      {created ? (
        <div className="mb-4 space-y-3 rounded-lg border border-amber-400/40 bg-amber-400/10 p-3">
          <p className="font-mono text-sm break-all">Cópiala ahora: {created}</p>
          {curl ? (
            <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] text-zinc-300">
              {curl}
            </pre>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-2">
        {rows.map((k) => (
          <div
            key={k.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm"
          >
            <span>
              {k.name}{" "}
              <span className="font-mono text-zinc-500">
                {k.prefix}… {k.is_management ? "mgmt" : "infer"}
                {k.disabled ? " · disabled" : ""}
              </span>
              <span className="mt-1 block text-xs text-zinc-500">
                uso {formatUsd(k.usage, 4)}
                {k.limit != null ? ` / ${formatUsd(k.limit, 2)}` : " · sin límite"}
                {k.workspace_id
                  ? ` · ws ${spaces.find((w) => w.id === k.workspace_id)?.name ?? k.workspace_id}`
                  : ""}
                {k.last_used ? ` · last ${new Date(k.last_used).toLocaleString()}` : " · nunca usada"}
              </span>
            </span>
            <span className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => void rotate(k.id)}>
                Rotar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void patch(k.id, { disabled: !k.disabled })}
              >
                {k.disabled ? "Activar" : "Pausar"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void remove(k.id)}>
                Revocar
              </Button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function KeysPage() {
  return (
    <Suspense
      fallback={
        <div>
          <AppPageHeader title="API Keys">Cargando…</AppPageHeader>
        </div>
      }
    >
      <KeysInner />
    </Suspense>
  );
}
