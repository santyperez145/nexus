"use client";

import Link from "next/link";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

async function sha256hex(value: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomVerifier() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function OauthPage() {
  const [verifier, setVerifier] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [exchangeCode, setExchangeCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function flashCopy(label: string, value: string) {
    const ok = await copy(value);
    setCopied(ok ? label : null);
    if (ok) setTimeout(() => setCopied(null), 1600);
  }

  async function issue() {
    setMsg(null);
    setKey(null);
    const next = randomVerifier();
    setVerifier(next);
    const res = await fetch("/api/v1/oauth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code_challenge: await sha256hex(next) }),
    });
    const json = await res.json();
    if (json.code) {
      setCode(json.code);
      setExchangeCode(json.code);
      return;
    }
    setMsg(json.error?.message ?? "No se pudo emitir el code");
  }

  async function exchange() {
    setMsg(null);
    const res = await fetch("/api/v1/oauth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: exchangeCode, code_verifier: verifier }),
    });
    const json = await res.json();
    if (json.key) {
      setKey(json.key);
      return;
    }
    setMsg(json.error?.message ?? "PKCE falló");
  }

  return (
    <div>
      <AppPageHeader title="OAuth PKCE">
        Flujo tipo “Connect app”: challenge SHA-256 → code → key <code>sk-nx-</code>. El verifier
        nunca sale de este dispositivo. Ideal para CLIs y apps de terceros.
      </AppPageHeader>

      <ol className="mb-6 grid gap-3 md:grid-cols-3">
        {[
          { n: "1", t: "Challenge", d: "Se genera verifier + SHA-256 en el browser." },
          { n: "2", t: "Code", d: "Nexus emite un code de un solo uso." },
          { n: "3", t: "Key", d: "Canje PKCE → sk-nx- (mostrada una vez)." },
        ].map((s) => (
          <li key={s.n} className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber-500/80">
              Paso {s.n}
            </div>
            <div className="mt-1 font-[family-name:var(--font-syne)] text-lg font-semibold text-zinc-100">
              {s.t}
            </div>
            <p className="mt-1 text-xs leading-5 text-zinc-500">{s.d}</p>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void issue()}>Emitir code</Button>
        <Button variant="outline" onClick={() => void exchange()} disabled={!verifier || !exchangeCode}>
          Canjear por key
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href="/settings/keys">Ver keys →</Link>
        </Button>
      </div>

      {code ? (
        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wide text-amber-500/80">code</span>
            <Button size="sm" variant="ghost" onClick={() => void flashCopy("code", code)}>
              {copied === "code" ? "Copiado" : "Copiar"}
            </Button>
          </div>
          <p className="font-mono text-xs break-all text-amber-200">{code}</p>
        </div>
      ) : null}

      {verifier ? (
        <div className="mt-2 rounded-xl border border-white/10 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">verifier (local)</span>
            <Button size="sm" variant="ghost" onClick={() => void flashCopy("verifier", verifier)}>
              {copied === "verifier" ? "Copiado" : "Copiar"}
            </Button>
          </div>
          <p className="font-mono text-xs break-all text-zinc-500">{verifier}</p>
        </div>
      ) : null}

      <div className="mt-4 max-w-xl">
        <label className="mb-1.5 block text-xs text-zinc-500">Code a canjear</label>
        <Input
          value={exchangeCode}
          onChange={(e) => setExchangeCode(e.target.value)}
          placeholder="code a canjear"
          aria-label="OAuth code"
        />
      </div>

      {key ? (
        <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/5 px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wide text-amber-400">API key</span>
            <Button size="sm" variant="ghost" onClick={() => void flashCopy("key", key)}>
              {copied === "key" ? "Copiado" : "Copiar"}
            </Button>
          </div>
          <p className="mt-1 font-mono text-sm break-all text-amber-200">{key}</p>
          <p className="mt-2 text-xs text-zinc-500">Copiá ahora. No se vuelve a mostrar.</p>
        </div>
      ) : null}

      {msg ? <p className="mt-4 text-sm text-amber-300">{msg}</p> : null}

      <section className="mt-8 rounded-2xl border border-white/10 p-4">
        <div className="mb-2 text-sm font-medium text-zinc-200">curl (server-side app)</div>
        <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-zinc-500">
{`# 1) challenge = sha256(verifier) hex
curl $NEXUS_URL/api/v1/oauth \\
  -H "Authorization: Bearer $SESSION_OR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"code_challenge":"<sha256hex>"}'

# 2) exchange
curl $NEXUS_URL/api/v1/oauth \\
  -H "Content-Type: application/json" \\
  -d '{"code":"<code>","code_verifier":"<verifier>"}'`}
        </pre>
        <p className="mt-3 text-xs leading-5 text-zinc-600">
          Requiere sesión de usuario al emitir el code (cookie o bearer de cuenta). El canje no
          reutiliza codes. Docs:{" "}
          <Link href="/docs" className="text-amber-400 hover:underline">
            /docs
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
