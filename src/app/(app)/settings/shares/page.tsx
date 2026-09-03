"use client";

import { useState } from "react";
import Link from "next/link";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { Button } from "@/components/ui/button";
import { useRemoteData } from "@/lib/use-remote-data";

type ShareRow = {
  id: string;
  title: string | null;
  model: string;
  messages: number;
  comparing: boolean;
  url: string;
  created_at: string;
};

export default function SharesSettingsPage() {
  const [rows, reload] = useRemoteData<ShareRow[]>("/api/v1/shares");
  const [busy, setBusy] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  async function remove(id: string) {
    setBusy(id);
    setLocalError(null);
    try {
      const res = await fetch(`/api/v1/shares?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setLocalError(json.error?.message ?? "No se pudo borrar");
        return;
      }
      reload();
    } finally {
      setBusy(null);
    }
  }

  async function copyUrl(url: string) {
    const absolute = `${window.location.origin}${url}`;
    await navigator.clipboard.writeText(absolute);
  }

  const err = localError;

  return (
    <div>
      <AppPageHeader title="Shares">
        Chats públicos creados desde el playground. Read-only en{" "}
        <code className="text-amber-400/80">/share/…</code> — listá y revocá los de tu cuenta.
      </AppPageHeader>

      {err ? (
        <p className="mb-4 rounded-lg border border-rose-400/30 bg-rose-400/5 px-3 py-2 text-sm text-rose-200">
          {err}
        </p>
      ) : null}

      {!rows ? (
        <p className="text-sm text-zinc-500">Cargando…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 px-4 py-10 text-center">
          <p className="text-sm text-zinc-400">Todavía no tenés shares propios.</p>
          <p className="mt-1 text-xs text-zinc-600">
            Desde Chat → Share (logueado) quedan atados a tu userId.
          </p>
          <Button asChild size="sm" className="mt-4" variant="outline">
            <Link href="/chat">Abrir playground</Link>
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-white/5 rounded-2xl border border-white/10">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link href={row.url} className="block truncate text-sm text-zinc-100 hover:text-amber-300">
                  {row.title || "Untitled"}
                </Link>
                <div className="mt-0.5 font-mono text-[11px] text-zinc-500">
                  {row.model} · {row.messages} msgs
                  {row.comparing ? " · compare" : ""} ·{" "}
                  {row.created_at ? new Date(row.created_at).toISOString().slice(0, 16) : "—"}Z
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => void copyUrl(row.url)}>
                Copiar URL
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy === row.id}
                onClick={() => void remove(row.id)}
              >
                {busy === row.id ? "…" : "Revocar"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
