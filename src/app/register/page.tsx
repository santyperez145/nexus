"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { AuthShell } from "@/components/layout/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function passwordStrength(pw: string) {
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  return Math.min(4, score);
}

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationPending, setVerificationPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const strength = useMemo(() => passwordStrength(password), [password]);
  const strengthLabel = ["", "Débil", "Ok", "Buena", "Fuerte"][strength] ?? "";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!terms) {
      setError("Aceptá los Términos y la Política de privacidad para continuar.");
      return;
    }
    setBusy(true);
    try {
      const { data, error: err } = await authClient.signUp.email({
        name,
        email,
        password,
        callbackURL: "/welcome",
      });
      if (err) {
        setError(
          err.status === 429
            ? "Demasiados intentos. Esperá unos segundos y volvé a probar."
            : err.message ?? "No se pudo crear la cuenta",
        );
        return;
      }
      if (data?.token) {
        router.push("/welcome");
        router.refresh();
        return;
      }
      setVerificationPending(true);
    } catch {
      setError("No pudimos conectar. Revisá tu conexión y volvé a probar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Crear cuenta" subtitle="Empezá a explorar y usar modelos desde un solo lugar.">
      {verificationPending ? (
        <div className="grid gap-4" role="status">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
            <p className="font-medium">Revisá tu correo</p>
            <p className="mt-1 text-emerald-800">
              Si la dirección puede registrarse, vas a recibir un enlace para confirmar la cuenta.
              También revisá la carpeta de spam.
            </p>
          </div>
          <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Link href="/login">Ir a ingresar</Link>
          </Button>
        </div>
      ) : (
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="name" className="text-zinc-700">
            Nombre
          </Label>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="border-zinc-300 bg-white text-zinc-900"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email" className="text-zinc-700">
            Correo electrónico
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="border-zinc-300 bg-white text-zinc-900"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password" className="text-zinc-700">
            Contraseña
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="border-zinc-300 bg-white text-zinc-900"
          />
          <p className="text-[11px] text-zinc-500">Usá al menos 12 caracteres.</p>
          {password ? (
            <div className="space-y-1">
              <div className="flex gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full ${
                      i < strength
                        ? strength <= 1
                          ? "bg-rose-400"
                          : strength <= 2
                            ? "bg-violet-500"
                            : "bg-emerald-500"
                        : "bg-zinc-200"
                    }`}
                  />
                ))}
              </div>
              <p className="text-[11px] text-zinc-500">{strengthLabel}</p>
            </div>
          ) : null}
        </div>
        <label className="flex items-start gap-2 text-sm text-zinc-600">
          <input
            name="terms"
            type="checkbox"
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
            className="mt-1"
          />
          <span>
            Acepto{" "}
            <Link href="/terms" className="text-violet-700 hover:underline">
              Términos
            </Link>{" "}
            y{" "}
            <Link href="/privacy" className="text-violet-700 hover:underline">
              Política de privacidad
            </Link>
            .
          </span>
        </label>
        {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
        <Button
          type="submit"
          disabled={busy}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {busy ? "Creando…" : "Crear cuenta"}
        </Button>
      </form>
      )}
      <p className="mt-4 text-sm text-zinc-500">
        ¿Ya tenés cuenta?{" "}
        <Link href="/login" className="text-violet-700 hover:underline">
          Entrar
        </Link>
        {" · "}
        <Link href="/chat" className="text-violet-700 hover:underline">
          Ver el chat
        </Link>
      </p>
    </AuthShell>
  );
}
