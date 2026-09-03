"use client";

import { CREDIT_PACKS } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export default function CreditsPage() {
  const [msg, setMsg] = useState<string | null>(null);
  const [threshold, setThreshold] = useState("5");
  const [amount, setAmount] = useState("25");

  async function buy(packId: string) {
    setMsg(null);
    const res = await fetch("/api/internal/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packId }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.assign(data.url);
      return;
    }
    setMsg(data.error ?? "No se pudo iniciar el checkout");
  }

  async function saveTopup() {
    const res = await fetch("/api/internal/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        autoTopupEnabled: true,
        autoTopupThresholdUsd: Number(threshold),
        autoTopupAmountUsd: Number(amount),
      }),
    });
    const json = await res.json();
    setMsg(json.ok ? "Auto top-up guardado" : json.error);
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Credits</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Pass-through del precio del laboratorio. Fee 4.9% al cargar con Stripe. Auto top-up recarga
        el wallet si el saldo cae bajo el umbral (wallet manual en dev).
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        {CREDIT_PACKS.map((p) => (
          <div key={p.id} className="rounded-xl border border-white/10 p-4">
            <div className="text-2xl font-semibold">{p.label}</div>
            <p className="mb-4 text-sm text-zinc-500">Saldo de inferencia + 4.9%</p>
            <Button onClick={() => void buy(p.id)}>Comprar</Button>
          </div>
        ))}
      </div>
      <h2 className="mt-10 mb-3 text-lg font-medium">Auto top-up</h2>
      <div className="grid max-w-xl gap-2 md:grid-cols-3">
        <Input value={threshold} onChange={(e) => setThreshold(e.target.value)} aria-label="Umbral USD" />
        <Input value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Monto USD" />
        <Button variant="outline" onClick={() => void saveTopup()}>
          Activar
        </Button>
      </div>
      <p className="mt-2 text-xs text-zinc-500">Si el saldo &lt; umbral, se acredita el monto.</p>
      {msg ? <p className="mt-4 text-sm text-amber-300">{msg}</p> : null}
    </div>
  );
}
