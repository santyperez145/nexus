"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { AuthShell } from "@/components/layout/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { error: err } = await authClient.signIn.email({ email, password });
      if (err) {
        setError(
          err.status === 403
            ? "Confirmá tu correo antes de ingresar. Te enviamos un nuevo enlace."
            : err.status === 429
              ? "Demasiados intentos. Esperá unos segundos y volvé a probar."
              : "El correo o la contraseña no son correctos.",
        );
        return;
      }
      router.push("/overview");
      router.refresh();
    } catch {
      setError("No pudimos conectar. Revisá tu conexión y volvé a probar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Ingresar" subtitle="Accedé a tus modelos, consumo y configuración.">
      <form onSubmit={onSubmit} className="grid gap-4">
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
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-zinc-700">
              Contraseña
            </Label>
            <Link href="/forgot-password" className="text-xs text-violet-700 hover:underline">
              Olvidé mi contraseña
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="border-zinc-300 bg-white text-zinc-900"
          />
        </div>
        {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
        <Button
          type="submit"
          disabled={busy}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {busy ? "Ingresando…" : "Ingresar"}
        </Button>
      </form>
      <p className="mt-4 text-sm text-zinc-500">
        ¿Todavía no tenés una cuenta?{" "}
        <Link href="/register" className="text-violet-700 hover:underline">
          Crear cuenta
        </Link>
      </p>
    </AuthShell>
  );
}
