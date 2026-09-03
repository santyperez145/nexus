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
  limit_remaining: number | null;
  limit_reset: string | null;
  include_byok_in_limit: boolean;
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
  const [editId, setEditId] = useState<string | null>(null);
  const [editLimit, setEditLimit] = useState("");
  const [editReset, setEditReset] = useState("monthly");
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
        Plaintext solo al crear, rotar o revelar welcome. Editá límite, reset y BYOK-in-limit como
        en OpenRouter — el gateway corta al agotar.
      </AppPageHeader>
      {welcomeNote ? <p className="mb-3 text-sm text-zinc-950">{welcomeNote}</p> : null}
      <div className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-zinc-200 bg-white p-3">
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
          className="h-9 rounded-md border border-zinc-200 bg-zinc-50 px-3 text-sm"
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
        <div className="mb-4 space-y-3 rounded-lg border border-violet-300 bg-amber-400/10 p-3">
          <p className="font-mono text-sm break-all">Cópiala ahora: {created}</p>
          {curl ? (
            <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] text-zinc-600">
              {curl}
            </pre>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-3">
        {rows.map((k) => {
          const pct =
            k.limit != null && k.limit > 0 ? Math.min(100, (k.usage / k.limit) * 100) : 0;
          return (
            <div key={k.id} className="rounded-2xl border border-zinc-200 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-lg font-semibold text-zinc-900">
                    {k.name}
                    {k.is_management ? (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-500/80">
                        mgmt
                      </span>
                    ) : null}
                    {k.disabled ? (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-rose-400/80">
                        paused
                      </span>
                    ) : null}
                  </div>
                  <div className="font-mono text-xs text-zinc-600">
                    {k.prefix}… · {k.hash}
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">
                    {k.workspace_id
                      ? `ws ${spaces.find((w) => w.id === k.workspace_id)?.name ?? k.workspace_id}`
                      : "sin workspace"}
                    {k.last_used
                      ? ` · last ${new Date(k.last_used).toLocaleString()}`
                      : " · nunca usada"}
                    {k.include_byok_in_limit ? " · BYOK cuenta" : " · BYOK fuera"}
                    {k.limit_reset ? ` · reset ${k.limit_reset}` : ""}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditId(k.id);
                      setEditLimit(k.limit != null ? String(k.limit) : "");
                      setEditReset(k.limit_reset ?? "monthly");
                    }}
                  >
                    Límites
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      void patch(k.id, { include_byok_in_limit: !k.include_byok_in_limit })
                    }
                  >
                    BYOK {k.include_byok_in_limit ? "on" : "off"}
                  </Button>
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
                </div>
              </div>

              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-zinc-500">
                  <span>
                    uso {formatUsd(k.usage, 4)}
                    {k.limit != null ? ` / ${formatUsd(k.limit, 2)}` : " · sin límite"}
                  </span>
                  {k.limit_remaining != null ? (
                    <span className="tabular-nums">
                      resto {formatUsd(k.limit_remaining, 4)} · {pct.toFixed(0)}%
                    </span>
                  ) : null}
                </div>
                {k.limit != null ? (
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div
                      className={`h-full rounded-full ${pct >= 90 ? "bg-rose-400/70" : "bg-amber-400/60"}`}
                      style={{ width: `${Math.max(pct ? 3 : 0, pct)}%` }}
                    />
                  </div>
                ) : null}
              </div>

              {editId === k.id ? (
                <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-zinc-100 pt-3">
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-wide text-zinc-500">
                      Límite USD
                    </label>
                    <Input
                      value={editLimit}
                      onChange={(e) => setEditLimit(e.target.value)}
                      className="w-28"
                      inputMode="decimal"
                      placeholder="vacío = ∞"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-wide text-zinc-500">
                      Reset
                    </label>
                    <select
                      value={editReset}
                      onChange={(e) => setEditReset(e.target.value)}
                      className="h-9 rounded-md border border-zinc-200 bg-zinc-50 px-3 text-sm"
                      aria-label="Periodo de reset"
                    >
                      <option value="daily">daily</option>
                      <option value="weekly">weekly</option>
                      <option value="monthly">monthly</option>
                    </select>
                  </div>
                  <Button
                    size="sm"
                    onClick={async () => {
                      await patch(k.id, {
                        limit: editLimit.trim() === "" ? null : Number(editLimit),
                        limit_reset: editReset,
                      });
                      setEditId(null);
                    }}
                  >
                    Guardar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                    Cancelar
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
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
