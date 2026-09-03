"use client";

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

export default function OauthPage() {
  const [verifier, setVerifier] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [exchangeCode, setExchangeCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function issue() {
    setMsg(null);
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
        Emití un <code>code</code> con challenge SHA-256 y canjealo por una key <code>sk-nx-</code>. El verifier queda en este dispositivo.
      </AppPageHeader>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void issue()}>Emitir code</Button>
        <Button variant="outline" onClick={() => void exchange()} disabled={!verifier}>
          Canjear por key
        </Button>
      </div>
      {code ? (
        <p className="mt-4 font-mono text-xs break-all text-amber-300">
          code {code}
        </p>
      ) : null}
      {verifier ? (
        <p className="mt-2 font-mono text-xs break-all text-zinc-500">verifier {verifier}</p>
      ) : null}
      <div className="mt-4 max-w-xl">
        <Input
          value={exchangeCode}
          onChange={(e) => setExchangeCode(e.target.value)}
          placeholder="code a canjear"
          aria-label="OAuth code"
        />
      </div>
      {key ? (
        <p className="mt-4 font-mono text-sm break-all text-amber-300">
          {key}
          <span className="block text-zinc-500">Copiá ahora. No se vuelve a mostrar.</span>
        </p>
      ) : null}
      {msg ? <p className="mt-4 text-sm text-amber-300">{msg}</p> : null}
    </div>
  );
}
