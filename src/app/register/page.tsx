"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { AuthShell } from "@/components/layout/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error: err } = await authClient.signUp.email({ name, email, password });
    if (err) {
      setError(err.message ?? "No se pudo crear la cuenta");
      return;
    }
    router.push("/welcome");
    router.refresh();
  }

  return (
    <AuthShell title="Crear cuenta" subtitle="Incluye $1 de crédito de bienvenida.">
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="name" className="text-zinc-700">
            Nombre
          </Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="border-zinc-300 bg-white text-zinc-900"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email" className="text-zinc-700">
            Email
          </Label>
          <Input
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="border-zinc-300 bg-white text-zinc-900"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password" className="text-zinc-700">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="border-zinc-300 bg-white text-zinc-900"
          />
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Button type="submit" className="bg-amber-600 text-white hover:bg-amber-700">
          Crear cuenta
        </Button>
      </form>
      <p className="mt-4 text-sm text-zinc-500">
        ¿Ya tenés cuenta?{" "}
        <Link href="/login" className="text-amber-700 hover:underline">
          Entrar
        </Link>
      </p>
    </AuthShell>
  );
}
