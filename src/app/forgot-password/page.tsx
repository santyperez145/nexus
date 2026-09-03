"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { AuthShell } from "@/components/layout/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error: err } = await authClient.requestPasswordReset({
        email,
        redirectTo,
      });
      if (err) {
        setError(err.message ?? "No se pudo enviar el mail");
        return;
      }
      setDone(true);
    } catch (ex) {
      setError((ex as Error).message ?? "Error de red");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Recuperar password"
      subtitle="Te mandamos un enlace si el email está registrado."
    >
      {done ? (
        <p className="text-sm text-zinc-600">
          Si existe una cuenta con ese email, revisá tu bandeja (y spam). En local sin{" "}
          <code className="text-zinc-800">RESEND_API_KEY</code> el enlace queda en los logs del
          servidor.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email" className="text-zinc-700">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="border-zinc-300 bg-white text-zinc-900"
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button
            type="submit"
            disabled={busy}
            className="bg-amber-600 text-white hover:bg-amber-700"
          >
            Enviar enlace
          </Button>
        </form>
      )}
      <p className="mt-4 text-sm text-zinc-500">
        <Link href="/login" className="text-amber-700 hover:underline">
          Volver a entrar
        </Link>
      </p>
    </AuthShell>
  );
}
