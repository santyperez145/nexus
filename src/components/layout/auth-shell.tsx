import Link from "next/link";
import { NexusWordmark } from "@/components/brand/nexus-logo";
import { HeroMesh } from "@/components/brand/hero-mesh";
import { AuthTrustStrip } from "@/components/layout/auth-trust-strip";
import { SIGNUP_BONUS_MICROS } from "@/lib/config";
import { formatUsd, microsToUsd } from "@/lib/money";

/** Shell claro para login / register / forgot / reset — atmósfera marketing. */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const welcome = formatUsd(microsToUsd(SIGNUP_BONUS_MICROS), 0);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fafaf9] text-zinc-900">
      <HeroMesh className="pointer-events-none absolute inset-0 h-full w-full opacity-90" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.55),transparent_55%)]"
      />
      <div className="relative mx-auto grid min-h-screen max-w-5xl md:grid-cols-[1.05fr_0.95fr]">
        <aside className="hidden flex-col justify-between px-8 py-12 md:flex lg:px-12">
          <Link href="/" className="text-[15px] text-zinc-950">
            <NexusWordmark tone="light" />
          </Link>
          <div className="max-w-md">
            <p className="font-[family-name:var(--font-syne)] text-4xl font-semibold tracking-tight text-zinc-950 lg:text-5xl">
              Una API.
              <br />
              Cientos de modelos.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-zinc-600">
              Routing, fallbacks, BYOK y créditos con 0% markup en inferencia. Fee solo al cargar.
              Guest playground con eco local sin signup.
            </p>
            <ul className="mt-8 space-y-2 text-sm text-zinc-600">
              <li className="flex gap-2">
                <span className="text-amber-700">→</span> OpenAI-compatible · keys{" "}
                <code className="text-zinc-800">sk-nx-</code>
              </li>
              <li className="flex gap-2">
                <span className="text-amber-700">→</span> {welcome} de bienvenida al crear cuenta
              </li>
              <li className="flex gap-2">
                <span className="text-amber-700">→</span> Route trace antes de gastar
              </li>
            </ul>
            <AuthTrustStrip />
          </div>
          <p className="text-xs text-zinc-400">
            <Link href="/status" className="hover:text-zinc-600">
              Status
            </Link>
            {" · "}
            <Link href="/docs" className="hover:text-zinc-600">
              Docs
            </Link>
            {" · "}
            <Link href="/credits" className="hover:text-zinc-600">
              Credits
            </Link>
            {" · "}
            <Link href="/chat" className="hover:text-zinc-600">
              Chat guest
            </Link>
          </p>
        </aside>

        <div className="flex flex-col justify-center px-4 py-12 md:px-8">
          <Link href="/" className="mb-8 text-[15px] text-zinc-950 md:hidden">
            <NexusWordmark tone="light" />
          </Link>
          <div className="rounded-2xl border border-zinc-200/80 bg-white/80 p-6 shadow-[0_20px_60px_-40px_rgba(180,83,9,0.35)] backdrop-blur-md md:p-8">
            <h1 className="mb-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight text-zinc-950">
              {title}
            </h1>
            {subtitle ? (
              <p className="mb-6 text-sm leading-relaxed text-zinc-500">{subtitle}</p>
            ) : (
              <div className="mb-6" />
            )}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
