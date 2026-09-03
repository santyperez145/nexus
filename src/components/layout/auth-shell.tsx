import Link from "next/link";
import { NexusWordmark } from "@/components/brand/nexus-logo";

/** Shell claro para login / register / forgot / reset. */
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
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-12">
        <Link href="/" className="mb-8 text-[15px] text-zinc-950">
          <NexusWordmark />
        </Link>
        <h1 className="mb-2 text-2xl font-semibold tracking-tight text-zinc-950">{title}</h1>
        {subtitle ? <p className="mb-6 text-sm text-zinc-500">{subtitle}</p> : <div className="mb-6" />}
        {children}
      </div>
    </div>
  );
}
