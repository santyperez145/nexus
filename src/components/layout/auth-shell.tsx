import Link from "next/link";
import { NexusWordmark } from "@/components/brand/nexus-logo";
import { AuthTrustStrip } from "@/components/layout/auth-trust-strip";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <div className="mx-auto grid min-h-screen max-w-5xl md:grid-cols-[1.05fr_0.95fr]">
        <aside className="hidden flex-col justify-between border-r border-zinc-100 px-8 py-12 md:flex lg:px-12">
          <Link href="/" className="text-[15px] text-zinc-950">
            <NexusWordmark tone="light" />
          </Link>
          <div className="max-w-md">
            <p className="text-4xl font-semibold tracking-tight text-zinc-950 lg:text-5xl">
              Todos los modelos. Una sola plataforma.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-zinc-500">
              Elegí, compará y usá los mejores modelos de IA con control de costos y privacidad.
            </p>
            <ul className="mt-8 space-y-2 text-sm text-zinc-600">
              <li>Una integración para texto, imágenes, audio y video</li>
              <li>Saldo y consumo visibles en tiempo real</li>
              <li>Privacidad y límites administrables por equipo</li>
            </ul>
            <AuthTrustStrip />
          </div>
          <p className="text-xs text-zinc-400">
            <Link href="/status" className="hover:text-zinc-600">
              Estado del servicio
            </Link>
            {" · "}
            <Link href="/docs" className="hover:text-zinc-600">
              Documentación
            </Link>
          </p>
        </aside>

        <div className="flex flex-col justify-center px-4 py-12 md:px-10">
          <Link href="/" className="mb-8 text-[15px] text-zinc-950 md:hidden">
            <NexusWordmark tone="light" />
          </Link>
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 md:border-0 md:p-0">
            <h1 className="mb-2 text-2xl font-semibold tracking-tight text-zinc-950">{title}</h1>
            {subtitle ? <p className="mb-6 text-sm leading-relaxed text-zinc-500">{subtitle}</p> : <div className="mb-6" />}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
