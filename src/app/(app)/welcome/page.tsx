"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { Button } from "@/components/ui/button";
import { formatUsd } from "@/lib/money";
import { useRemoteData } from "@/lib/use-remote-data";

type Credits = { remaining: number };
type KeyRow = { id: string; prefix: string };

const STEPS = [
  { id: 1, title: "Crédito", body: "Tu wallet nace con $1 de bienvenida." },
  { id: 2, title: "API key", body: "Revelá la key Default una sola vez." },
  { id: 3, title: "Primer request", body: "Probá chat o Studio (eco local sin labs)." },
  { id: 4, title: "Cables", body: "Conectá labs o BYOK cuando quieras live." },
];

export default function WelcomePage() {
  const [credits] = useRemoteData<Credits>("/api/v1/credits");
  const [keys, reloadKeys] = useRemoteData<KeyRow[]>("/api/v1/keys");
  const [plain, setPlain] = useState<string | null>(null);
  const [curl, setCurl] = useState<string | null>(null);
  const [ping, setPing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // mark seen
    try {
      localStorage.setItem("nexus_welcome_seen", "1");
    } catch {
      /* ignore */
    }
  }, []);

  async function reveal() {
    setBusy(true);
    try {
      const res = await fetch("/api/internal/keys/welcome", { method: "POST" });
      const json = await res.json();
      if (json.data?.key) {
        setPlain(json.data.key);
        setCurl(json.data.curl ?? null);
      }
      reloadKeys();
    } finally {
      setBusy(false);
    }
  }

  async function firstPing() {
    setBusy(true);
    setPing(null);
    try {
      const res = await fetch("/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Title": "Nexus Welcome",
        },
        body: JSON.stringify({
          model: "nexus/auto",
          messages: [{ role: "user", content: "ping welcome" }],
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setPing(json.error?.message ?? "Error");
        return;
      }
      setPing(
        `OK · ${json.model} · ${json.provider ?? "?"} · gen ${json.id ?? ""}`.trim(),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <AppPageHeader title="Bienvenido a Nexus">
        Setup en 4 pasos. Sin inventar tracción: saldo real, key real, request real.
      </AppPageHeader>

      <ol className="mb-8 grid gap-3 sm:grid-cols-2">
        {STEPS.map((s) => (
          <li key={s.id} className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.12em] text-amber-500/80">Paso {s.id}</div>
            <div className="mt-1 font-[family-name:var(--font-syne)] text-lg font-semibold text-zinc-100">
              {s.title}
            </div>
            <p className="mt-1 text-sm text-zinc-500">{s.body}</p>
          </li>
        ))}
      </ol>

      <section className="mb-6 rounded-2xl border border-white/10 p-4">
        <div className="text-xs text-zinc-500">Saldo</div>
        <div className="font-[family-name:var(--font-syne)] text-3xl font-semibold text-amber-300">
          {credits ? formatUsd(credits.remaining, 2) : "…"}
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-white/10 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-medium text-zinc-200">API key</div>
            <div className="text-xs text-zinc-500">
              {(keys ?? []).length} key(s) · revelación one-time
            </div>
          </div>
          <Button size="sm" disabled={busy} onClick={() => void reveal()}>
            Revelar bienvenida
          </Button>
        </div>
        {plain ? (
          <pre className="overflow-x-auto rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 font-mono text-xs text-amber-100">
            {plain}
            {curl ? `\n\n${curl}` : ""}
          </pre>
        ) : null}
      </section>

      <section className="mb-8 rounded-2xl border border-white/10 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-medium text-zinc-200">Primer request</div>
            <div className="text-xs text-zinc-500">POST /api/v1/chat/completions · nexus/auto</div>
          </div>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void firstPing()}>
            Enviar ping
          </Button>
        </div>
        {ping ? <p className="font-mono text-xs text-zinc-400">{ping}</p> : null}
      </section>

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/chat">Abrir Chat</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/studio">Studio</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/settings/connections">Conexiones</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/overview">Overview</Link>
        </Button>
      </div>
    </div>
  );
}
