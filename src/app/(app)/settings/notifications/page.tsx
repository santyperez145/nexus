"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  BellRing,
  CheckCircle2,
  KeyRound,
  Mail,
  Send,
  Users,
  WalletCards,
  Webhook,
} from "lucide-react";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useRemoteData } from "@/lib/use-remote-data";

type Prefs = {
  notifyLowBalance: boolean;
  notifyKeyLimit: boolean;
  notifyOrgInvite: boolean;
  lowBalanceThresholdUsd: string;
  emailDeliveryAvailable: boolean;
};

type Feedback = {
  tone: "success" | "error";
  text: string;
};

type ApiError = {
  error?: string | { message?: string };
};

function errorMessage(value: ApiError, fallback: string) {
  return typeof value.error === "string"
    ? value.error
    : value.error?.message || fallback;
}

export default function NotificationsPage() {
  const [remote, reload, loadError] = useRemoteData<Prefs>(
    "/api/internal/preferences",
  );
  const [draftPrefs, setDraftPrefs] = useState<Partial<Prefs>>({});
  const [draftThreshold, setDraftThreshold] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const prefs: Prefs | null = remote
    ? {
        notifyLowBalance: remote.notifyLowBalance ?? true,
        notifyKeyLimit: remote.notifyKeyLimit ?? true,
        notifyOrgInvite: remote.notifyOrgInvite ?? true,
        lowBalanceThresholdUsd: String(remote.lowBalanceThresholdUsd ?? "5"),
        emailDeliveryAvailable: remote.emailDeliveryAvailable ?? false,
        ...draftPrefs,
      }
    : null;

  const threshold = draftThreshold ?? prefs?.lowBalanceThresholdUsd ?? "5";

  async function save(patch: Partial<Prefs>) {
    if (!prefs || saving) return;
    const next = { ...prefs, ...patch, lowBalanceThresholdUsd: threshold };
    setDraftPrefs((current) => ({ ...current, ...patch }));
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/internal/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notifyLowBalance: next.notifyLowBalance,
          notifyKeyLimit: next.notifyKeyLimit,
          notifyOrgInvite: next.notifyOrgInvite,
          lowBalanceThresholdUsd: Number(next.lowBalanceThresholdUsd),
        }),
      });
      const json = (await response.json().catch(() => ({}))) as ApiError;
      if (!response.ok) {
        setDraftPrefs({});
        setFeedback({
          tone: "error",
          text: errorMessage(json, "No pudimos guardar los cambios."),
        });
        return;
      }
      setDraftThreshold(null);
      setFeedback({ tone: "success", text: "Preferencias guardadas." });
      reload();
    } catch {
      setDraftPrefs({});
      setFeedback({
        tone: "error",
        text: "No pudimos guardar los cambios. Revisá tu conexión.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    if (!prefs?.emailDeliveryAvailable || testing) return;
    setTesting(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/internal/notifications/test", {
        method: "POST",
      });
      const json = (await response.json().catch(() => ({}))) as ApiError;
      setFeedback(
        response.ok
          ? { tone: "success", text: "Correo de prueba enviado." }
          : {
              tone: "error",
              text: errorMessage(
                json,
                "No pudimos enviar el correo de prueba.",
              ),
            },
      );
    } catch {
      setFeedback({
        tone: "error",
        text: "No pudimos enviar el correo de prueba. Revisá tu conexión.",
      });
    } finally {
      setTesting(false);
    }
  }

  if (!prefs) {
    return (
      <div>
        <AppPageHeader title="Avisos">
          Elegí cuándo querés recibir novedades importantes sobre tu cuenta.
        </AppPageHeader>
        {loadError ? (
          <div className="max-w-2xl rounded-2xl border border-red-200 bg-red-50 p-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 size-5 text-red-600" />
              <div>
                <p className="font-medium text-red-950">
                  No pudimos cargar tus avisos
                </p>
                <p className="mt-1 text-sm text-red-700">{loadError}</p>
                <Button className="mt-4" variant="outline" onClick={reload}>
                  Intentar de nuevo
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl animate-pulse space-y-3">
            <div className="h-24 rounded-2xl bg-zinc-100" />
            <div className="h-64 rounded-2xl bg-zinc-100" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <AppPageHeader title="Avisos">
        Elegí qué eventos importantes querés recibir por correo. El historial y
        las integraciones se administran por separado.
      </AppPageHeader>

      <div className="mb-7 grid gap-3 md:grid-cols-3">
        <ChannelCard
          icon={<Mail className="size-4" />}
          title="Correo"
          description={
            prefs.emailDeliveryAvailable
              ? "Listo para enviar avisos"
              : "Pendiente de activación"
          }
          status={prefs.emailDeliveryAvailable ? "Disponible" : "No disponible"}
          active={prefs.emailDeliveryAvailable}
        />
        <ChannelLink
          href="/settings/observability"
          icon={<Webhook className="size-4" />}
          title="Monitoreo"
          description="Entregas para tus sistemas"
          action="Configurar"
        />
        <ChannelLink
          href="/activity"
          icon={<Activity className="size-4" />}
          title="Actividad"
          description="Historial de solicitudes"
          action="Ver historial"
        />
      </div>

      {!prefs.emailDeliveryAvailable ? (
        <div className="mb-5 flex max-w-3xl items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5">
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-700" />
          <div>
            <p className="text-sm font-medium text-amber-950">
              El envío de correo todavía no está habilitado
            </p>
            <p className="mt-0.5 text-sm leading-relaxed text-amber-800">
              Podés dejar tus preferencias listas. Los avisos comenzarán a
              enviarse cuando el canal esté disponible.
            </p>
          </div>
        </div>
      ) : null}

      <section className="max-w-3xl overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <BellRing className="size-4 text-violet-700" />
            <h2 className="font-semibold text-zinc-950">
              Preferencias por correo
            </h2>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            Activá sólo los avisos que requieren tu atención.
          </p>
        </div>

        <NotificationRow
          icon={<WalletCards className="size-4" />}
          title="Saldo bajo"
          description="Te avisamos cuando tu saldo disponible cruza el importe elegido."
          control={
            <Switch
              aria-label="Avisos de saldo bajo"
              checked={prefs.notifyLowBalance}
              disabled={saving}
              onCheckedChange={(value) =>
                void save({ notifyLowBalance: value })
              }
            />
          }
        >
          <div className="mt-3 flex flex-wrap items-end gap-2 pl-11">
            <div>
              <Label
                htmlFor="low-balance-threshold"
                className="mb-1.5 block text-xs text-zinc-600"
              >
                Avisarme cuando baje de
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-zinc-500">
                  $
                </span>
                <Input
                  id="low-balance-threshold"
                  aria-label="Umbral de saldo bajo en dólares"
                  value={threshold}
                  onChange={(event) => setDraftThreshold(event.target.value)}
                  className="w-32 pl-7"
                  inputMode="decimal"
                  disabled={saving}
                />
              </div>
            </div>
            <Button
              variant="outline"
              disabled={saving || draftThreshold === null}
              onClick={() => void save({})}
            >
              {saving ? "Guardando…" : "Guardar importe"}
            </Button>
          </div>
        </NotificationRow>

        <NotificationRow
          icon={<KeyRound className="size-4" />}
          title="Límite de una clave"
          description="Te avisamos cuando una clave alcanza el 90% de su límite de gasto."
          control={
            <Switch
              aria-label="Avisos de límite de gasto por clave"
              checked={prefs.notifyKeyLimit}
              disabled={saving}
              onCheckedChange={(value) => void save({ notifyKeyLimit: value })}
            />
          }
        />

        <NotificationRow
          icon={<Users className="size-4" />}
          title="Invitaciones a equipos"
          description="Te avisamos cuando recibís una invitación a una organización."
          control={
            <Switch
              aria-label="Avisos de invitaciones a equipos"
              checked={prefs.notifyOrgInvite}
              disabled={saving}
              onCheckedChange={(value) => void save({ notifyOrgInvite: value })}
            />
          }
          last
        />
      </section>

      <section className="mt-5 flex max-w-3xl flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-zinc-50/70 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-700">
            <Send className="size-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-950">
              Comprobar el correo
            </p>
            <p className="mt-0.5 text-sm text-zinc-500">
              Enviá un mensaje de prueba a la dirección de tu cuenta.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          disabled={!prefs.emailDeliveryAvailable || testing}
          onClick={() => void sendTest()}
        >
          {testing ? "Enviando…" : "Enviar prueba"}
        </Button>
      </section>

      {feedback ? (
        <div
          role="status"
          aria-live="polite"
          className={`mt-4 flex max-w-3xl items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${
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
      ) : null}
    </div>
  );
}

function ChannelCard({
  icon,
  title,
  description,
  status,
  active,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  status: string;
  active: boolean;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-950">
          <span className="rounded-lg bg-zinc-100 p-2 text-zinc-700">
            {icon}
          </span>
          {title}
        </div>
        <span
          className={`rounded-full px-2 py-1 text-[11px] font-medium ${
            active
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-800"
          }`}
        >
          {status}
        </span>
      </div>
      <p className="mt-3 text-xs text-zinc-500">{description}</p>
    </div>
  );
}

function ChannelLink({
  href,
  icon,
  title,
  description,
  action,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
  action: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-zinc-200 bg-white p-4 transition-colors hover:border-violet-200 hover:bg-violet-50/30"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-zinc-950">
        <span className="rounded-lg bg-zinc-100 p-2 text-zinc-700 transition-colors group-hover:bg-violet-100 group-hover:text-violet-700">
          {icon}
        </span>
        {title}
      </div>
      <p className="mt-3 text-xs text-zinc-500">{description}</p>
      <p className="mt-2 text-xs font-medium text-violet-700">{action} →</p>
    </Link>
  );
}

function NotificationRow({
  icon,
  title,
  description,
  control,
  children,
  last = false,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  control: ReactNode;
  children?: ReactNode;
  last?: boolean;
}) {
  return (
    <div className={`px-5 py-5 ${last ? "" : "border-b border-zinc-100"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 rounded-lg bg-violet-50 p-2 text-violet-700">
            {icon}
          </span>
          <div>
            <p className="text-sm font-medium text-zinc-950">{title}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-zinc-500">
              {description}
            </p>
          </div>
        </div>
        <div className="pt-1">{control}</div>
      </div>
      {children}
    </div>
  );
}
