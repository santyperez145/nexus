import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db, ensureDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { formatUsd, microsToUsd } from "@/lib/money";
import { NexusWordmark } from "@/components/brand/nexus-logo";
import { AppNav } from "@/components/layout/app-nav";
import { SignOutButton } from "@/components/layout/sign-out";
import { isPlatformAdmin } from "@/lib/config";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  await ensureDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, session.user.id)).limit(1);
  const balance = formatUsd(microsToUsd(user?.creditMicros ?? 0), 2);
  const platformAdmin = isPlatformAdmin(session.user.email);

  return (
    <div className="nexus-grid relative min-h-screen bg-[#f7f8fd] text-zinc-900">
      <aside className="nexus-console-grid fixed inset-y-0 left-0 z-20 hidden w-[16.5rem] flex-col border-r border-white/10 bg-[#0b0e1a] p-4 md:flex">
        <Link href="/overview" className="mb-5 flex items-center justify-between text-[15px] text-zinc-100">
          <NexusWordmark tone="dark" />
          <span className="rounded-full border border-indigo-400/20 bg-indigo-400/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-indigo-200">
            Console
          </span>
        </Link>
        <Link
          href="/settings/credits"
          className="mb-6 block rounded-xl border border-white/10 bg-white/[0.055] px-3 py-3 transition-all hover:border-indigo-400/40 hover:bg-white/[0.08]"
        >
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-zinc-400">
            <span>Saldo disponible</span>
            <span className="size-1.5 rounded-full bg-emerald-400" />
          </div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-white">{balance}</div>
        </Link>
        <AppNav platformAdmin={platformAdmin} userEmail={session.user.email} />
      </aside>
      <div className="relative md:pl-[16.5rem]">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-[#0b0e1a] px-4 py-3 text-sm text-zinc-400 md:hidden">
          <span className="flex min-w-0 items-center gap-2 text-zinc-950">
            <NexusWordmark tone="dark" markClassName="size-5" />
            <span className="truncate text-xs text-zinc-300">{session.user.email}</span>
          </span>
          <div className="flex items-center gap-2">
            <Link href="/settings/credits" className="font-mono text-xs text-cyan-300">
              {balance}
            </Link>
            <SignOutButton compact />
          </div>
        </div>
        <AppNav variant="mobile" platformAdmin={platformAdmin} />
        <main className="relative mx-auto max-w-[82rem] p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
