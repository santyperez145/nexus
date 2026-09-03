"use client";

import { AppPageHeader } from "@/components/layout/app-page-header";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRemoteData } from "@/lib/use-remote-data";

type Member = { id: string; userId: string; role: string; email: string; name: string };
type Pending = { id: string; email: string; role: string; expiresAt: string };
type Org = {
  id: string;
  name: string;
  slug: string;
  role: string;
  ownerId: string;
  members: Member[];
  pending_invites?: Pending[];
};

export default function OrgsPage() {
  const [rows, reload] = useRemoteData<Org[]>("/api/v1/organization");
  const [name, setName] = useState("");
  const [invite, setInvite] = useState("");
  const [role, setRole] = useState("member");
  const [acceptToken, setAcceptToken] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [lastAcceptUrl, setLastAcceptUrl] = useState<string | null>(null);
  const list = rows ?? [];

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("invite");
    if (!token) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/v1/organization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept_token: token }),
      });
      const json = await res.json();
      if (cancelled) return;
      setMsg(json.data ? "Invitación aceptada" : json.error?.message ?? "No se pudo aceptar");
      reload();
      window.history.replaceState({}, "", "/settings/organizations");
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  async function createOrg() {
    setMsg(null);
    const res = await fetch("/api/v1/organization", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const json = await res.json();
    setMsg(json.data ? `Creada ${json.data.name}` : json.error?.message ?? "Error");
    setName("");
    reload();
  }

  async function inviteMember(orgId: string) {
    setMsg(null);
    setLastAcceptUrl(null);
    const res = await fetch("/api/v1/organization", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organization_id: orgId, invite_email: invite, role }),
    });
    const json = await res.json();
    if (json.data?.accept_url) setLastAcceptUrl(json.data.accept_url);
    setMsg(
      json.data?.status === "pending"
        ? `Invite pendiente a ${json.data.email}`
        : json.data
          ? `Unido ${json.data.email}`
          : (json.error?.message ?? "error"),
    );
    setInvite("");
    reload();
  }

  async function acceptManual() {
    setMsg(null);
    const res = await fetch("/api/v1/organization", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accept_token: acceptToken.trim() }),
    });
    const json = await res.json();
    setMsg(json.data ? "Invitación aceptada" : json.error?.message ?? "No se pudo aceptar");
    setAcceptToken("");
    reload();
  }

  return (
    <div>
      <AppPageHeader title="Organizations">
        Equipos con roles owner/member, invites por email (7d) y accept por link o token. Paridad
        B2B tipo OpenRouter orgs — sin inventar billing multi-tenant todavía.
      </AppPageHeader>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Orgs" value={String(list.length)} />
        <Stat
          label="Miembros"
          value={String(list.reduce((n, o) => n + (o.members?.length ?? 0), 0))}
        />
        <Stat
          label="Pending"
          value={String(list.reduce((n, o) => n + (o.pending_invites?.length ?? 0), 0))}
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre org" />
        <Button disabled={!name.trim()} onClick={() => void createOrg()}>
          Crear
        </Button>
      </div>

      <div className="mb-6 rounded-2xl border border-dashed border-white/15 p-3">
        <div className="mb-2 text-xs font-medium uppercase tracking-[0.1em] text-zinc-600">
          Aceptar invite (token)
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            value={acceptToken}
            onChange={(e) => setAcceptToken(e.target.value)}
            placeholder="nxi_… o token del mail"
            className="max-w-md"
          />
          <Button variant="outline" disabled={!acceptToken.trim()} onClick={() => void acceptManual()}>
            Aceptar
          </Button>
        </div>
      </div>

      {msg ? <p className="mb-4 text-sm text-amber-300">{msg}</p> : null}
      {lastAcceptUrl ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs">
          <span className="text-amber-200/90">Link invite:</span>
          <code className="max-w-full truncate font-mono text-amber-100/80">{lastAcceptUrl}</code>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void navigator.clipboard.writeText(lastAcceptUrl)}
          >
            Copiar
          </Button>
        </div>
      ) : null}

      {!rows ? (
        <p className="text-sm text-zinc-500">Cargando…</p>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 px-4 py-10 text-center text-sm text-zinc-500">
          Sin organizaciones. Creá una o aceptá un invite.
        </div>
      ) : (
        <div className="grid gap-3">
          {list.map((o) => (
            <div key={o.id} className="rounded-2xl border border-white/10 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-[family-name:var(--font-syne)] text-lg font-semibold text-zinc-100">
                    {o.name}
                  </div>
                  <div className="font-mono text-xs text-zinc-600">
                    /{o.slug} · {o.role} · {o.members?.length ?? 0} members
                    {(o.pending_invites?.length ?? 0) > 0
                      ? ` · ${o.pending_invites!.length} pending`
                      : ""}
                  </div>
                </div>
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

              <div className="mt-3 space-y-1 text-xs text-zinc-500">
                {o.members?.map((m) => (
                  <div key={m.id} className="flex justify-between gap-2">
                    <span>
                      {m.email || m.name} · {m.role}
                    </span>
                  </div>
                ))}
                {o.pending_invites?.map((p) => (
                  <div key={p.id} className="text-amber-400/80">
                    {p.email} · pending · {p.role}
                    {p.expiresAt
                      ? ` · exp ${new Date(p.expiresAt).toISOString().slice(0, 10)}`
                      : ""}
                  </div>
                ))}
              </div>

              {o.role === "owner" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Input
                    value={invite}
                    onChange={(e) => setInvite(e.target.value)}
                    placeholder="email a invitar"
                    className="min-w-[12rem] flex-1"
                  />
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="h-9 rounded-md border border-white/10 bg-zinc-950 px-2 text-sm"
                    aria-label="Rol invite"
                  >
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!invite.trim()}
                    onClick={() => void inviteMember(o.id)}
                  >
                    Invitar
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">{label}</div>
      <div className="mt-1 font-mono text-lg text-amber-200">{value}</div>
    </div>
  );
}
