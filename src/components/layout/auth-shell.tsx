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
    <div className="nexus-grid min-h-screen bg-[#f8f9ff] text-zinc-900">
      <div className="mx-auto grid min-h-screen max-w-[90rem] md:grid-cols-[1.08fr_0.92fr]">
        <aside className="nexus-console-grid relative hidden flex-col justify-between overflow-hidden border-r border-white/10 bg-[#0b0e1a] px-8 py-12 text-white md:flex lg:px-14">
          <div aria-hidden className="absolute -left-28 top-1/3 size-80 rounded-full bg-indigo-500/15 blur-3xl" />
          <Link href="/" className="relative text-[15px] text-zinc-100">
            <NexusWordmark tone="dark" />
          </Link>
          <div className="relative max-w-lg">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-[9px] uppercase tracking-[0.17em] text-cyan-300">
              <span className="size-1.5 rounded-full bg-cyan-400" />
              Control plane multi‑IA
            </div>
            <p className="font-[family-name:var(--font-syne)] text-4xl font-semibold leading-[1.02] tracking-[-0.045em] text-white lg:text-5xl">
              Todos los modelos. Tu política. Una red.
            </p>
            <p className="mt-5 text-sm leading-6 text-zinc-400">
              Ejecutá OpenAI, Anthropic, Google, Mistral y modelos abiertos con control de costos, privacidad y rutas.
            </p>
            <ul className="mt-8 space-y-3 text-sm text-zinc-300">
              {[
                "Una integración para texto, imágenes, audio y video",
                "Ledger y consumo visibles en tiempo real",
                "Privacidad y límites administrables por equipo",
              ].map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <span className="size-1.5 rounded-full bg-indigo-400" />
                  {item}
                </li>
              ))}
            </ul>
            <AuthTrustStrip />
          </div>
          <p className="relative text-xs text-zinc-500">
            <Link href="/status" className="hover:text-zinc-200">
              Estado del servicio
            </Link>
            {" · "}
            <Link href="/docs" className="hover:text-zinc-200">
              Documentación
            </Link>
          </p>
        </aside>

        <div className="flex flex-col justify-center px-4 py-12 md:px-10 lg:px-16">
          <Link href="/" className="mb-8 text-[15px] text-zinc-950 md:hidden">
            <NexusWordmark tone="light" />
          </Link>
          <div className="nexus-surface w-full max-w-lg rounded-3xl border border-indigo-100 bg-white/95 p-6 md:p-8">
            <div className="mb-3 font-mono text-[9px] uppercase tracking-[0.18em] text-indigo-600">Acceso seguro</div>
            <h1 className="mb-2 font-[family-name:var(--font-syne)] text-2xl font-semibold tracking-tight text-[#111326]">{title}</h1>
            {subtitle ? <p className="mb-6 text-sm leading-relaxed text-zinc-500">{subtitle}</p> : <div className="mb-6" />}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
