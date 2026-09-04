"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DeviceSession = {
  id: string;
  token: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  expiresAt: Date | string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

function deviceName(userAgent?: string | null) {
  if (!userAgent) return "Dispositivo desconocido";
  const os = /iPhone|iPad/i.test(userAgent)
    ? "iPhone / iPad"
    : /Android/i.test(userAgent)
      ? "Android"
      : /Windows/i.test(userAgent)
        ? "Windows"
        : /Macintosh|Mac OS/i.test(userAgent)
          ? "macOS"
          : /Linux/i.test(userAgent)
            ? "Linux"
            : "Dispositivo";
  const browser = /Edg\//i.test(userAgent)
    ? "Edge"
    : /OPR\//i.test(userAgent)
      ? "Opera"
      : /Chrome\//i.test(userAgent)
        ? "Chrome"
        : /Firefox\//i.test(userAgent)
          ? "Firefox"
          : /Safari\//i.test(userAgent)
            ? "Safari"
            : "Navegador";
  return `${browser} en ${os}`;
}

function readableDate(value: Date | string) {
  return new Date(value).toLocaleString("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function errorMessage(error: { message?: string } | null | undefined, fallback: string) {
  return error?.message || fallback;
}

export function AccountSettings({
  initialName,
  email,
  emailVerified,
  emailDeliveryConfigured,
  hasPassword,
  currentSessionId,
  createdAt,
}: {
  initialName: string;
  email: string;
  emailVerified: boolean;
  emailDeliveryConfigured: boolean;
  hasPassword: boolean;
  currentSessionId: string;
  createdAt: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [sessionsMessage, setSessionsMessage] = useState<string | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);

  async function loadSessions() {
    setSessionsLoading(true);
    const result = await authClient.listSessions();
    if (result.error) {
      setSessionsMessage(errorMessage(result.error, "No se pudieron cargar las sesiones."));
      setSessions([]);
    } else {
      setSessions((result.data ?? []) as DeviceSession[]);
      setSessionsMessage(null);
    }
    setSessionsLoading(false);
  }

  useEffect(() => {
    let active = true;
    void authClient.listSessions().then((result) => {
      if (!active) return;
      if (result.error) {
        setSessionsMessage(errorMessage(result.error, "No se pudieron cargar las sesiones."));
        setSessions([]);
      } else {
        setSessions((result.data ?? []) as DeviceSession[]);
        setSessionsMessage(null);
      }
      setSessionsLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function saveProfile() {
    const nextName = name.trim();
    if (!nextName || nextName.length > 80) {
      setProfileMessage("El nombre debe tener entre 1 y 80 caracteres.");
      return;
    }
    setProfileSaving(true);
    setProfileMessage(null);
    const result = await authClient.updateUser({ name: nextName });
    setProfileSaving(false);
    if (result.error) {
      setProfileMessage(errorMessage(result.error, "No se pudo actualizar el perfil."));
      return;
    }
    setName(nextName);
    setProfileMessage("Perfil actualizado.");
    router.refresh();
  }

  async function resendVerification() {
    setVerificationMessage(null);
    const result = await authClient.sendVerificationEmail({
      email,
      callbackURL: "/settings/account",
    });
    setVerificationMessage(
      result.error
        ? errorMessage(result.error, "No se pudo enviar el correo.")
        : "Correo de verificación enviado.",
    );
  }

  async function changePassword() {
    if (newPassword.length < 12 || newPassword.length > 128) {
      setPasswordMessage("La contraseña nueva debe tener entre 12 y 128 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage("Las contraseñas nuevas no coinciden.");
      return;
    }
    setPasswordSaving(true);
    setPasswordMessage(null);
    const result = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    setPasswordSaving(false);
    if (result.error) {
      setPasswordMessage(errorMessage(result.error, "No se pudo cambiar la contraseña."));
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordMessage("Contraseña actualizada y demás sesiones cerradas.");
    await loadSessions();
  }

  async function revokeSession(session: DeviceSession) {
    setSessionsMessage(null);
    const result = await authClient.revokeSession({ token: session.token });
    if (result.error) {
      setSessionsMessage(errorMessage(result.error, "No se pudo cerrar la sesión."));
      return;
    }
    setSessionsMessage("Sesión cerrada.");
    await loadSessions();
  }

  async function revokeOthers() {
    setSessionsMessage(null);
    const result = await authClient.revokeOtherSessions();
    if (result.error) {
      setSessionsMessage(errorMessage(result.error, "No se pudieron cerrar las demás sesiones."));
      return;
    }
    setSessionsMessage("Se cerraron todas las demás sesiones.");
    await loadSessions();
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1.15fr]">
      <div className="grid content-start gap-6">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-zinc-950">Identidad</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Cuenta creada el {new Date(createdAt).toLocaleDateString("es-AR")}.
              </p>
            </div>
            <span
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                emailVerified
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              {emailVerified ? "Email verificado" : "Email sin verificar"}
            </span>
          </div>
          <label className="mt-5 block text-xs font-medium text-zinc-600">
            Nombre
            <Input className="mt-1.5" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="mt-4 block text-xs font-medium text-zinc-600">
            Email
            <Input className="mt-1.5" value={email} readOnly disabled />
          </label>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button disabled={profileSaving} onClick={() => void saveProfile()}>
              {profileSaving ? "Guardando…" : "Guardar nombre"}
            </Button>
            {!emailVerified && emailDeliveryConfigured ? (
              <Button variant="outline" onClick={() => void resendVerification()}>
                Reenviar verificación
              </Button>
            ) : null}
          </div>
          {!emailVerified && !emailDeliveryConfigured ? (
            <p className="mt-3 text-xs text-amber-700">La verificación por correo todavía no está habilitada.</p>
          ) : null}
          <p aria-live="polite" className="mt-3 min-h-5 text-xs text-zinc-600">
            {profileMessage || verificationMessage}
          </p>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="font-semibold text-zinc-950">Contraseña</h2>
          {hasPassword ? (
            <>
              <p className="mt-1 text-xs text-zinc-500">Al cambiarla, Nexus cerrará las demás sesiones.</p>
              <div className="mt-4 grid gap-3">
                <Input type="password" autoComplete="current-password" placeholder="Contraseña actual" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
                <Input type="password" autoComplete="new-password" placeholder="Nueva contraseña" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
                <Input type="password" autoComplete="new-password" placeholder="Repetir nueva contraseña" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              </div>
              <Button className="mt-4" disabled={passwordSaving || !currentPassword} onClick={() => void changePassword()}>
                {passwordSaving ? "Actualizando…" : "Cambiar contraseña"}
              </Button>
              <p aria-live="polite" className="mt-3 min-h-5 text-xs text-zinc-600">{passwordMessage}</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">Esta cuenta inicia sesión mediante un proveedor externo.</p>
          )}
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4">
          <div>
            <h2 className="font-semibold text-zinc-950">Sesiones activas</h2>
            <p className="mt-1 text-xs text-zinc-500">Revisá y cerrá dispositivos que ya no reconozcas.</p>
          </div>
          <Button size="sm" variant="outline" disabled={sessions.length <= 1} onClick={() => void revokeOthers()}>
            Cerrar las demás
          </Button>
        </div>
        <div className="divide-y divide-zinc-100">
          {sessions.map((session) => {
            const current = session.id === currentSessionId;
            return (
              <div key={session.id} className="flex items-start justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-zinc-900">{deviceName(session.userAgent)}</span>
                    {current ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">Esta sesión</span> : null}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    Última actividad {readableDate(session.updatedAt)} · vence {readableDate(session.expiresAt)}
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-zinc-400">{session.ipAddress || "IP no disponible"}</div>
                </div>
                {!current ? (
                  <Button size="sm" variant="ghost" onClick={() => void revokeSession(session)}>Cerrar</Button>
                ) : null}
              </div>
            );
          })}
          {sessionsLoading ? <p className="px-5 py-8 text-center text-sm text-zinc-500">Cargando sesiones…</p> : null}
          {!sessionsLoading && !sessions.length ? <p className="px-5 py-8 text-center text-sm text-zinc-500">No se encontraron sesiones activas.</p> : null}
        </div>
        <p aria-live="polite" className="min-h-10 border-t border-zinc-100 px-5 py-3 text-xs text-zinc-600">{sessionsMessage}</p>
      </section>
    </div>
  );
}
