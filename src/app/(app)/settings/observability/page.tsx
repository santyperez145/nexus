"use client";

import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import {
  Activity,
  AlertCircle,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  LoaderCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Webhook,
  XCircle,
} from "lucide-react";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRemoteData } from "@/lib/use-remote-data";

type Destination = {
  id: string;
  name: string;
  type: string;
  config: { url?: string; has_secret?: boolean };
};

type Delivery = {
  id: string;
  destinationId: string;
  event: string;
  status: "pending" | "processing" | "failed" | "delivered" | "dead";
  attempts: number;
  responseStatus?: number | null;
  lastError?: string | null;
  nextAttemptAt: string;
  deliveredAt?: string | null;
  createdAt: string;
};

type ApiError = { error?: string | { message?: string; code?: string } };
type Feedback = { tone: "success" | "error"; text: string };
type Probe = { tone: "success" | "error"; text: string };

const deliveryLabels: Record<Delivery["status"], string> = {
  pending: "Pendiente",
  processing: "Enviando",
  failed: "Reintentando",
  delivered: "Entregado",
  dead: "Fallido",
};

function errorMessage(value: ApiError, fallback: string) {
  if (typeof value.error === "object") {
    if (value.error?.code === "ssrf_blocked") {
      return "La URL debe apuntar a un servicio público; las redes privadas están bloqueadas.";
    }
    if (value.error?.code === "https_required") {
      return "El destino debe usar una dirección HTTPS.";
    }
    if (value.error?.code === "invalid_url") {
      return "Ingresá una URL válida para el destino.";
    }
  }
  return typeof value.error === "string"
    ? value.error
    : value.error?.message || fallback;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function deliveryTone(status: Delivery["status"]) {
  if (status === "delivered") return "bg-emerald-50 text-emerald-700";
  if (status === "dead") return "bg-red-50 text-red-700";
  if (status === "failed") return "bg-amber-50 text-amber-800";
  return "bg-zinc-100 text-zinc-700";
}

export default function ObservabilityPage() {
  const [rows, reload, loadError] =
    useRemoteData<Destination[]>("/api/v1/observability");
  const [deliveries, reloadDeliveries, deliveriesError] =
    useRemoteData<Delivery[]>("/api/v1/observability?deliveries=1");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("Webhook");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [probes, setProbes] = useState<Record<string, Probe>>({});
  const [creating, setCreating] = useState(false);
  const [probingId, setProbingId] = useState<string | null>(null);

  const list = rows ?? [];
  const deliveredCount =
    deliveries?.filter((delivery) => delivery.status === "delivered").length ?? 0;
  const attentionCount =
    deliveries?.filter(
      (delivery) => delivery.status === "failed" || delivery.status === "dead",
    ).length ?? 0;

  function refresh() {
    reload();
    reloadDeliveries();
  }

  async function createDestination(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url.trim() || creating) return;
    setCreating(true);
    setFeedback(null);
    setRevealed(null);
    setCopied(false);
    try {
      const response = await fetch("/api/v1/observability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), name: name.trim() || "Webhook" }),
      });
      const json = (await response.json().catch(() => ({}))) as ApiError & {
        data?: { revealed_secret?: string };
      };
      if (!response.ok || !json.data) {
        setFeedback({
          tone: "error",
          text: errorMessage(json, "No pudimos crear el destino."),
        });
        return;
      }
      setRevealed(json.data.revealed_secret ?? null);
      setFeedback({ tone: "success", text: "Destino creado y firma activada." });
      setUrl("");
      setName("Webhook");
      refresh();
    } catch {
      setFeedback({
        tone: "error",
        text: "No pudimos crear el destino. Revisá tu conexión.",
      });
    } finally {
      setCreating(false);
    }
  }

  async function probeDestination(destination: Destination) {
    if (probingId) return;
    setProbingId(destination.id);
    setFeedback(null);
    try {
      const response = await fetch("/api/v1/observability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ping", id: destination.id }),
      });
      const json = (await response.json().catch(() => ({}))) as ApiError & {
        data?: { ok?: boolean; status?: number };
      };
      if (!response.ok || !json.data) {
        setProbes((current) => ({
          ...current,
          [destination.id]: {
            tone: "error",
            text: errorMessage(json, "La prueba no pudo completarse."),
          },
        }));
        return;
      }
      const probeData = json.data;
      const ok = Boolean(probeData.ok);
      setProbes((current) => ({
        ...current,
        [destination.id]: {
          tone: ok ? "success" : "error",
          text: ok
            ? `Respondió correctamente (HTTP ${probeData.status ?? 200}).`
            : `Respondió con HTTP ${probeData.status ?? "desconocido"}.`,
        },
      }));
    } catch {
      setProbes((current) => ({
        ...current,
        [destination.id]: {
          tone: "error",
          text: "No se pudo contactar al destino.",
        },
      }));
    } finally {
      setProbingId(null);
    }
  }

  async function removeDestination(destination: Destination) {
    setFeedback(null);
    const response = await fetch(
      `/api/v1/observability?id=${encodeURIComponent(destination.id)}`,
      { method: "DELETE" },
    );
    const json = (await response.json().catch(() => ({}))) as ApiError;
    if (!response.ok) {
      setFeedback({
        tone: "error",
        text: errorMessage(json, "No pudimos quitar el destino."),
      });
      return;
    }
    setFeedback({ tone: "success", text: "Destino quitado." });
    refresh();
  }

  async function copySecret() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed);
      setCopied(true);
    } catch {
      setFeedback({
        tone: "error",
        text: "No pudimos copiar el secreto. Seleccionalo y copialo manualmente.",
      });
    }
  }

  return (
    <div>
      <AppPageHeader
        title="Monitoreo"
        actions={
          <Button variant="outline" onClick={refresh}>
            <RefreshCw className="size-3.5" />
            Actualizar
          </Button>
        }
      >
        Conectá tus sistemas para recibir cada generación y revisar si las
        entregas llegaron correctamente.
      </AppPageHeader>

      <div className="mb-7 grid gap-3 sm:grid-cols-3">
        <MetricCard
          icon={<Webhook className="size-4" />}
          label="Destinos activos"
          value={rows ? String(list.length) : "—"}
        />
        <MetricCard
          icon={<CheckCircle2 className="size-4" />}
          label="Entregas correctas"
          value={deliveries ? String(deliveredCount) : "—"}
          tone="success"
        />
        <MetricCard
          icon={<AlertCircle className="size-4" />}
          label="Requieren atención"
          value={deliveries ? String(attentionCount) : "—"}
          tone={attentionCount ? "danger" : "neutral"}
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Send className="size-4 text-violet-700" />
            <h2 className="font-semibold text-zinc-950">Agregar un destino</h2>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            Nexus enviará eventos firmados a una URL pública HTTPS.
          </p>
        </div>
        <form
          className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_15rem_auto] md:items-end"
          onSubmit={createDestination}
        >
          <div>
            <Label htmlFor="destination-url" className="mb-1.5 block text-xs text-zinc-600">
              URL del destino
            </Label>
            <Input
              id="destination-url"
              type="url"
              inputMode="url"
              autoComplete="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://api.tuempresa.com/eventos"
              disabled={creating}
              required
            />
          </div>
          <div>
            <Label htmlFor="destination-name" className="mb-1.5 block text-xs text-zinc-600">
              Nombre
            </Label>
            <Input
              id="destination-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              placeholder="Producción"
              disabled={creating}
            />
          </div>
          <Button type="submit" disabled={!url.trim() || creating}>
            {creating ? <LoaderCircle className="size-3.5 animate-spin" /> : <Webhook className="size-3.5" />}
            {creating ? "Creando…" : "Crear destino"}
          </Button>
        </form>
      </section>

      {revealed ? (
        <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-amber-700" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-950">
                  Guardá este secreto ahora
                </p>
                <p className="mt-0.5 text-sm text-amber-800">
                  Se muestra una sola vez y permite comprobar que cada evento salió de Nexus.
                </p>
                <code className="mt-3 block max-w-full overflow-x-auto rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-zinc-800">
                  {revealed}
                </code>
              </div>
            </div>
            <Button type="button" variant="outline" onClick={() => void copySecret()}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copiado" : "Copiar secreto"}
            </Button>
          </div>
        </section>
      ) : null}

      {feedback ? <FeedbackBanner feedback={feedback} /> : null}

      <section className="mt-8">
        <div className="mb-3">
          <h2 className="font-semibold text-zinc-950">Destinos</h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Probá una conexión antes de depender de ella en producción.
          </p>
        </div>

        {loadError ? (
          <LoadError message={loadError} onRetry={reload} />
        ) : !rows ? (
          <div className="grid animate-pulse gap-3 sm:grid-cols-2">
            <div className="h-32 rounded-2xl bg-zinc-100" />
            <div className="h-32 rounded-2xl bg-zinc-100" />
          </div>
        ) : list.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {list.map((destination) => {
              const probe = probes[destination.id];
              const probing = probingId === destination.id;
              return (
                <article
                  key={destination.id}
                  className="rounded-2xl border border-zinc-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="rounded-xl bg-violet-50 p-2.5 text-violet-700">
                        <Webhook className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-zinc-950">
                          {destination.name}
                        </h3>
                        <p className="mt-1 truncate font-mono text-xs text-zinc-500">
                          {destination.config.url}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${
                        destination.config.has_secret
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-800"
                      }`}
                    >
                      {destination.config.has_secret ? "Firma activa" : "Sin firma"}
                    </span>
                  </div>

                  {probe ? (
                    <div
                      role="status"
                      className={`mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${
                        probe.tone === "success"
                          ? "bg-emerald-50 text-emerald-800"
                          : "bg-red-50 text-red-800"
                      }`}
                    >
                      {probe.tone === "success" ? (
                        <CheckCircle2 className="size-3.5 shrink-0" />
                      ) : (
                        <XCircle className="size-3.5 shrink-0" />
                      )}
                      {probe.text}
                    </div>
                  ) : null}

                  <div className="mt-4 flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={Boolean(probingId)}
                      onClick={() => void probeDestination(destination)}
                    >
                      {probing ? (
                        <LoaderCircle className="size-3.5 animate-spin" />
                      ) : (
                        <Activity className="size-3.5" />
                      )}
                      {probing ? "Probando…" : "Probar conexión"}
                    </Button>
                    <ConfirmAction
                      triggerLabel="Quitar"
                      title={`Quitar ${destination.name}`}
                      description="Nexus dejará de enviar eventos a este destino. El historial existente se conservará."
                      confirmLabel="Quitar destino"
                      onConfirm={() => removeDestination(destination)}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-200 px-5 py-10 text-center">
            <span className="mx-auto flex size-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600">
              <Webhook className="size-5" />
            </span>
            <p className="mt-3 text-sm font-medium text-zinc-900">Todavía no hay destinos</p>
            <p className="mt-1 text-sm text-zinc-500">
              Agregá una URL para empezar a recibir eventos firmados.
            </p>
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-3">
          <h2 className="font-semibold text-zinc-950">Entregas recientes</h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Se conservan los últimos 50 envíos. Los fallos se reintentan hasta seis veces durante 24 horas.
          </p>
        </div>

        {deliveriesError ? (
          <LoadError message={deliveriesError} onRetry={reloadDeliveries} />
        ) : !deliveries ? (
          <div className="h-28 animate-pulse rounded-2xl bg-zinc-100" />
        ) : deliveries.length ? (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            {deliveries.map((delivery) => (
              <article
                key={delivery.id}
                className="grid gap-3 border-b border-zinc-100 px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_8rem_7rem_11rem] md:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-900">
                    {delivery.event}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-400">
                    {delivery.id}
                  </p>
                  {delivery.lastError ? (
                    <p className="mt-1 truncate text-xs text-red-700" title={delivery.lastError}>
                      {delivery.lastError}
                    </p>
                  ) : null}
                </div>
                <span className={`w-fit rounded-full px-2 py-1 text-[11px] font-medium ${deliveryTone(delivery.status)}`}>
                  {deliveryLabels[delivery.status]}
                </span>
                <span className="text-xs text-zinc-500">
                  {delivery.attempts} de 6 intentos
                </span>
                <div className="text-xs text-zinc-500">
                  <p>{delivery.responseStatus ? `HTTP ${delivery.responseStatus}` : "Sin respuesta"}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-400">
                    {formatDate(delivery.deliveredAt ?? delivery.createdAt)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-200 px-5 py-9 text-center">
            <Clock3 className="mx-auto size-5 text-zinc-400" />
            <p className="mt-2 text-sm text-zinc-500">Todavía no hay entregas.</p>
          </div>
        )}
      </section>

      <details className="mt-8 max-w-3xl rounded-2xl border border-zinc-200 bg-zinc-50/70">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-800">
          Detalles para integrar la firma
        </summary>
        <div className="border-t border-zinc-200 px-4 py-4 text-sm text-zinc-600">
          <p>
            Cada solicitud incluye el evento en <code>x-nexus-event</code> y la firma en{" "}
            <code>x-nexus-signature</code>. Calculá HMAC-SHA256 sobre el cuerpo recibido sin modificarlo.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 bg-white p-3 text-[11px] text-zinc-600">
            {`{
  "event": "generation.completed",
  "data": { "id": "gen-…", "model": "…", "provider": "…", "cost_micros": 0 }
}`}
          </pre>
        </div>
      </details>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "neutral" | "success" | "danger";
}) {
  const iconTone =
    tone === "success"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "danger"
        ? "bg-red-50 text-red-700"
        : "bg-zinc-100 text-zinc-700";
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-zinc-500">{label}</p>
        <span className={`rounded-lg p-2 ${iconTone}`}>{icon}</span>
      </div>
      <p className="mt-2 font-mono text-2xl font-medium text-zinc-950">{value}</p>
    </div>
  );
}

function FeedbackBanner({ feedback }: { feedback: Feedback }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`mt-4 flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${
        feedback.tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-red-200 bg-red-50 text-red-800"
      }`}
    >
      {feedback.tone === "success" ? (
        <CheckCircle2 className="size-4 shrink-0" />
      ) : (
        <AlertCircle className="size-4 shrink-0" />
      )}
      {feedback.text}
    </div>
  );
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-red-800">
        <AlertCircle className="size-4 shrink-0" />
        {message}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}
