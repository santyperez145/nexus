import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db, ensureDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { formatUsd, microsToUsd } from "@/lib/money";
import { NexusWordmark } from "@/components/brand/nexus-logo";
import { AppNav } from "@/components/layout/app-nav";
import { SignOutButton } from "@/components/layout/sign-out";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  await ensureDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, session.user.id)).limit(1);
  const balance = formatUsd(microsToUsd(user?.creditMicros ?? 0), 2);

  return (
    <div className="relative min-h-screen bg-zinc-950 text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(245,158,11,0.07),transparent_42%),radial-gradient(ellipse_at_bottom_right,rgba(255,255,255,0.03),transparent_40%)]"
      />
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[15.5rem] flex-col border-r border-white/10 bg-zinc-950/80 p-4 backdrop-blur-md md:flex">
        <Link href="/overview" className="mb-5 block text-[15px]">
          <NexusWordmark />
        </Link>
        <Link
          href="/settings/credits"
          className="mb-6 block rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2.5 transition-colors hover:border-amber-400/40"
        >
          <div className="text-[10px] uppercase tracking-[0.12em] text-amber-500/80">Saldo</div>
          <div className="font-[family-name:var(--font-syne)] text-lg font-semibold text-amber-300">{balance}</div>
        </Link>
        <AppNav />
      </aside>
      <div className="relative md:pl-[15.5rem]">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-zinc-950/80 px-4 py-3 text-sm text-zinc-400 backdrop-blur md:hidden">
          <span className="flex min-w-0 items-center gap-2">
            <NexusWordmark markClassName="size-5" />
            <span className="truncate text-xs">{session.user.email}</span>
          </span>
          <div className="flex items-center gap-2">
            <Link href="/settings/credits" className="font-mono text-xs text-amber-400">
              {balance}
            </Link>
            <SignOutButton compact />
          </div>
        </div>
        <AppNav variant="mobile" />
        <main className="relative mx-auto max-w-6xl p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
