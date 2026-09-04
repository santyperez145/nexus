"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";

export function CreditAdjustmentForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/internal/admin/users/${encodeURIComponent(userId)}/credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_usd: Number(amount),
          reason,
          idempotency_key: crypto.randomUUID(),
        }),
      });
      const payload = (await response.json()) as {
        data?: { applied: boolean; balance_usd: number };
        error?: string;
      };
      if (!response.ok || !payload.data) throw new Error(payload.error || `HTTP ${response.status}`);
      setMessage(
        `${payload.data.applied ? "Ajuste aplicado" : "Operación ya aplicada"}. Saldo: USD ${payload.data.balance_usd.toFixed(2)}.`,
      );
      setAmount("");
      setReason("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo ajustar el saldo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <h2 className="font-semibold text-zinc-950">Ajuste manual de saldo</h2>
      <p className="mt-1 text-xs leading-5 text-zinc-600">
        Usá valores positivos para acreditar y negativos para corregir. No modifica el plan ni reemplaza reembolsos en Stripe.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-[9rem_1fr_auto]">
        <input
          required
          type="number"
          step="0.01"
          min="-10000"
          max="10000"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="USD +10.00"
          className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-violet-400"
        />
        <input
          required
          minLength={8}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Motivo auditable (ticket, incidente o corrección)"
          className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-violet-400"
        />
        <Button disabled={busy || !amount || reason.trim().length < 8}>
          {busy ? "Aplicando…" : "Aplicar ajuste"}
        </Button>
      </div>
      <div aria-live="polite" className="mt-2 min-h-5 text-xs text-zinc-700">{message}</div>
    </form>
  );
}
