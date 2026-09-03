import Link from "next/link";
import { NexusWordmark } from "@/components/brand/nexus-logo";
import { HeroMesh } from "@/components/brand/hero-mesh";

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
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fafaf9] text-zinc-900">
      <HeroMesh className="pointer-events-none absolute inset-0 h-full w-full opacity-90" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.55),transparent_55%)]"
      />
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
        <Link href="/" className="mb-8 text-[15px] text-zinc-950">
          <NexusWordmark tone="light" />
        </Link>
        <div className="rounded-2xl border border-zinc-200/80 bg-white/80 p-6 shadow-[0_20px_60px_-40px_rgba(180,83,9,0.35)] backdrop-blur-md md:p-8">
          <h1 className="mb-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight text-zinc-950">
            {title}
          </h1>
          {subtitle ? <p className="mb-6 text-sm leading-relaxed text-zinc-500">{subtitle}</p> : <div className="mb-6" />}
          {children}
        </div>
      </div>
    </div>
  );
}
