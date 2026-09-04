"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function StripeEventReplayButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function replay() {
    setRunning(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/internal/admin/stripe/events/${encodeURIComponent(eventId)}/replay`,
        { method: "POST" },
      );
      const payload = (await response.json()) as {
        data?: { outcome?: string };
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      setMessage(payload.data?.outcome === "already_processed" ? "Ya procesado" : "Procesado");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falló");
      router.refresh();
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mt-2 flex items-center justify-between gap-2">
      <span aria-live="polite" className="min-h-4 text-[10px] text-zinc-500">
        {message}
      </span>
      <Button size="sm" variant="outline" disabled={running} onClick={() => void replay()}>
        {running ? "Procesando…" : "Reprocesar"}
      </Button>
    </div>
  );
}
