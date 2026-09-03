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
    <div className="relative min-h-screen bg-zinc-50 text-zinc-900">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[15.5rem] flex-col border-r border-zinc-200 bg-white p-4 md:flex">
        <Link href="/overview" className="mb-5 block text-[15px] text-zinc-950">
          <NexusWordmark tone="light" />
        </Link>
        <Link
          href="/settings/credits"
          className="mb-6 block rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 transition-colors hover:border-violet-300"
        >
          <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Saldo disponible</div>
          <div className="text-lg font-semibold tabular-nums text-zinc-950">{balance}</div>
        </Link>
        <AppNav platformAdmin={platformAdmin} />
      </aside>
      <div className="relative md:pl-[15.5rem]">
        <div className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-500 md:hidden">
          <span className="flex min-w-0 items-center gap-2 text-zinc-950">
            <NexusWordmark tone="light" markClassName="size-5" />
            <span className="truncate text-xs">{session.user.email}</span>
          </span>
          <div className="flex items-center gap-2">
            <Link href="/settings/credits" className="font-mono text-xs text-violet-700">
              {balance}
            </Link>
            <SignOutButton compact />
          </div>
        </div>
        <AppNav variant="mobile" platformAdmin={platformAdmin} />
        <main className="relative mx-auto max-w-6xl p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
