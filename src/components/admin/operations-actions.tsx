"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type Action = "probe" | "sync-catalog";

export function OperationsActions() {
  const router = useRouter();
  const [running, setRunning] = useState<Action | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: Action) {
    setRunning(action);
    setMessage(null);
    try {
      const response = await fetch("/api/internal/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json()) as { data?: unknown; error?: string };
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      if (action === "sync-catalog") {
        const count = (payload.data as { count?: number } | undefined)?.count;
        setMessage(typeof count === "number" ? `Catálogo sincronizado: ${count} modelos.` : "Catálogo sincronizado.");
      } else {
        setMessage("Sondas completadas y persistidas.");
      }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "La operación falló.");
    } finally {
      setRunning(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={running !== null} onClick={() => run("probe")}>
          {running === "probe" ? "Verificando…" : "Verificar proveedores"}
        </Button>
        <Button disabled={running !== null} onClick={() => run("sync-catalog")}>
          {running === "sync-catalog" ? "Sincronizando…" : "Sincronizar catálogo"}
        </Button>
      </div>
      <div aria-live="polite" className="mt-2 min-h-5 text-xs text-zinc-600">
        {message}
      </div>
    </div>
  );
}
