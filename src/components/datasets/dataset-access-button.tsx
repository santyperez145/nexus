"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function DatasetAccessButton({ path }: { path: string }) {
  const [state, setState] = useState<"idle" | "busy" | "pending" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        disabled={state === "busy" || state === "pending"}
        onClick={async () => {
          setState("busy");
          setMessage(null);
          try {
            const response = await fetch(`/api/v1/datasets/${path}/access`, { method: "POST" });
            const json = (await response.json().catch(() => ({}))) as {
              data?: { status?: string };
              error?: { message?: string };
            };
            if (!response.ok) {
              throw new Error(json.error?.message ?? "No se pudo solicitar acceso");
            }
            setState("pending");
            setMessage(json.data?.status === "owner" ? "Ya tenés acceso." : "Solicitud enviada al propietario.");
          } catch (error) {
            setState("error");
            setMessage(error instanceof Error ? error.message : "No se pudo solicitar acceso");
          }
        }}
      >
        {state === "busy" ? "Enviando…" : state === "pending" ? "Solicitud pendiente" : "Solicitar acceso"}
      </Button>
      {message ? (
        <span className={`text-sm ${state === "error" ? "text-red-600" : "text-emerald-700"}`}>
          {message}
        </span>
      ) : null}
    </div>
  );
}
