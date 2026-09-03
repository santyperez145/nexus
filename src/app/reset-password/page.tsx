"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { AuthShell } from "@/components/layout/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError("Falta el token del enlace. Pedí uno nuevo.");
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (err) {
        setError(err.message ?? "No se pudo actualizar");
        return;
      }
      router.push("/login");
      router.refresh();
    } catch (ex) {
      setError((ex as Error).message ?? "Error de red");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Nueva contraseña" subtitle="Elegí una contraseña de al menos 12 caracteres.">
      {!token ? (
        <p className="text-sm text-red-600">
          Token inválido o ausente.{" "}
          <Link href="/forgot-password" className="text-violet-700 hover:underline">
            Pedir otro enlace
          </Link>
          .
        </p>
      ) : (
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="password" className="text-zinc-700">
              Nueva contraseña
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
          </div>
          {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
          <Button
            type="submit"
            disabled={busy}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Guardar
          </Button>
        </form>
      )}
      <p className="mt-4 text-sm text-zinc-500">
        <Link href="/login" className="text-violet-700 hover:underline">
          Volver a entrar
        </Link>
      </p>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthShell title="Nueva contraseña">
          <p className="text-sm text-zinc-500">Cargando…</p>
        </AuthShell>
      }
    >
      <ResetForm />
    </Suspense>
  );
}
