"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { Button } from "@/components/ui/button";
import { formatUsd } from "@/lib/money";
import { useRemoteData } from "@/lib/use-remote-data";

type Credits = { remaining: number };
type KeyRow = { id: string; prefix: string };
type Status = { ok?: boolean; providers?: Record<string, boolean> };

const STEPS = [
  { id: 1, title: "Saldo", body: "Elegí un plan o cargá créditos para empezar." },
  { id: 2, title: "Clave API", body: "Guardá la clave inicial que creamos para tu cuenta." },
  { id: 3, title: "Primera respuesta", body: "Hacé una prueba y comprobá que todo esté listo." },
  { id: 4, title: "Proveedores", body: "Usá las conexiones de Nexus o agregá las tuyas." },
];

export default function WelcomePage() {
  const [credits] = useRemoteData<Credits>("/api/v1/credits");
  const [keys, reloadKeys] = useRemoteData<KeyRow[]>("/api/v1/keys");
  const [wiredLabs, setWiredLabs] = useState(0);
  const [plain, setPlain] = useState<string | null>(null);
  const [curl, setCurl] = useState<string | null>(null);
  const [ping, setPing] = useState<string | null>(null);
  const [pingOk, setPingOk] = useState(false);
  const [pingGen, setPingGen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem("nexus_welcome_seen", "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/v1/status", { signal: ac.signal })
      .then((r) => r.json())
      .then((json: Status) => {
        if (ac.signal.aborted) return;
        setWiredLabs(Object.values(json.providers ?? {}).filter(Boolean).length);
      })
      .catch(() => undefined);
    return () => ac.abort();
  }, []);

  const done = {
    1: Boolean(credits && credits.remaining > 0),
    2: Boolean(plain || (keys && keys.length > 0)),
    3: pingOk,
    4: wiredLabs > 0,
  };
  const active = !done[1] ? 1 : !done[2] ? 2 : !done[3] ? 3 : 4;
  const completedCount = Object.values(done).filter(Boolean).length;

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
        setPingOk(false);
        return;
      }
      setPingOk(true);
      const gen = json.id ? String(json.id) : "";
      setPing(
        `OK · ${json.model} · ${json.provider ?? "?"}${gen ? ` · gen ${gen}` : ""}`.trim(),
      );
      if (gen) setPingGen(gen);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <AppPageHeader title="Bienvenido a Nexus">
        Prepará tu cuenta en cuatro pasos · {completedCount}/4 completados.
      </AppPageHeader>

      <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full bg-violet-500 transition-[width]"
          style={{ width: `${(completedCount / 4) * 100}%` }}
        />
      </div>

      <ol className="mb-8 grid gap-3 sm:grid-cols-2">
        {STEPS.map((s) => {
          const isDone = done[s.id as 1 | 2 | 3 | 4];
          const isActive = active === s.id;
          return (
            <li
              key={s.id}
              className={`rounded-xl border px-4 py-3 ${
                isActive
                  ? "border-violet-300 bg-violet-50"
                  : isDone
                    ? "border-emerald-500/25 bg-emerald-500/[0.04]"
                    : "border-zinc-200 bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] uppercase tracking-[0.12em] text-violet-700">
                  Paso {s.id}
                </div>
                <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                  {isDone ? "listo" : isActive ? "ahora" : "luego"}
                </span>
              </div>
              <div className="mt-1 text-lg font-semibold text-zinc-900">
                {s.title}
              </div>
              <p className="mt-1 text-sm text-zinc-500">{s.body}</p>
            </li>
          );
        })}
      </ol>

      <section className="mb-6 rounded-2xl border border-zinc-200 p-4">
        <div className="text-xs text-zinc-500">Saldo</div>
        <div className="text-3xl font-semibold text-zinc-950">
          {credits ? formatUsd(credits.remaining, 2) : "…"}
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-zinc-200 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-medium text-zinc-800">Clave API</div>
            <div className="text-xs text-zinc-500">
              {(keys ?? []).length} {(keys ?? []).length === 1 ? "clave creada" : "claves creadas"} · se muestra una sola vez
            </div>
          </div>
          <Button size="sm" disabled={busy} onClick={() => void reveal()}>
            Mostrar clave inicial
          </Button>
        </div>
        {plain ? (
          <pre className="overflow-x-auto rounded-lg border border-violet-200 bg-violet-50 p-3 font-mono text-xs text-zinc-800">
            {plain}
            {curl ? `\n\n${curl}` : ""}
          </pre>
        ) : null}
      </section>

      <section className="mb-8 rounded-2xl border border-zinc-200 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-medium text-zinc-800">Primera prueba</div>
            <div className="text-xs text-zinc-500">Nexus elegirá automáticamente el modelo disponible más conveniente.</div>
          </div>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void firstPing()}>
            Probar conexión
          </Button>
        </div>
        {ping ? <p className="font-mono text-xs text-zinc-400">{ping}</p> : null}
        {pingGen ? (
          <p className="mt-2 text-xs text-zinc-500">
            <Link href={`/activity/${pingGen}`} className="text-violet-700 hover:underline">
              Ver detalle →
            </Link>
          </p>
        ) : null}
      </section>

      <section className="mb-8 rounded-2xl border border-zinc-200 p-4">
        <div className="font-medium text-zinc-800">Integrá Nexus en tu aplicación</div>
        <p className="mt-1 text-sm text-zinc-500">
          Empezá con nuestro SDK o copiá una plantilla preparada para los casos más comunes.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-[11px] text-zinc-400">
{`import { Nexus } from "nexus-sdk";
const nexus = new Nexus({ apiKey: process.env.NEXUS_API_KEY });
await nexus.chat.send({
  model: "nexus/auto",
  messages: [{ role: "user", content: "hola" }],
});`}
        </pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/apps/auto-router">Plantilla de selección automática</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/apps">Apps</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href="/docs">Documentación</Link>
          </Button>
        </div>
      </section>

      <section className="mb-8 rounded-2xl border border-zinc-200 p-4">
        <div className="font-medium text-zinc-800">Proveedores</div>
        <p className="mt-1 text-sm text-zinc-500">
          {wiredLabs > 0
            ? `${wiredLabs} ${wiredLabs === 1 ? "proveedor disponible" : "proveedores disponibles"}.`
            : "Todavía no hay proveedores disponibles. Agregá una conexión propia antes de hacer la primera prueba."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/settings/connections">Conexiones</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/settings/byok">Proveedores propios</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href="/status">Estado del servicio</Link>
          </Button>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/chat">Abrir Chat</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/studio">Estudio multimedia</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/overview">Ir al inicio</Link>
        </Button>
      </div>
    </div>
  );
}
