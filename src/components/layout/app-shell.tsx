import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db, ensureDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { formatUsd, microsToUsd } from "@/lib/money";
import { NexusWordmark } from "@/components/brand/nexus-logo";
import { SignOutButton } from "@/components/layout/sign-out";

const NAV = [
  { href: "/overview", label: "Overview" },
  { href: "/chat", label: "Chat" },
  { href: "/activity", label: "Activity" },
  { href: "/analytics", label: "Analytics" },
  { href: "/models", label: "Models" },
  { href: "/rankings", label: "Rankings" },
  { href: "/settings/connections", label: "Conexiones" },
  { href: "/settings/credits", label: "Credits" },
  { href: "/settings/keys", label: "API Keys" },
  { href: "/settings/files", label: "Files" },
  { href: "/settings/presets", label: "Presets" },
  { href: "/settings/byok", label: "BYOK" },
  { href: "/settings/guardrails", label: "Guardrails" },
  { href: "/settings/observability", label: "Observability" },
  { href: "/settings/oauth", label: "OAuth" },
  { href: "/settings/workspaces", label: "Workspaces" },
  { href: "/settings/organizations", label: "Organizations" },
  { href: "/settings/privacy", label: "Privacy" },
  { href: "/settings/preferences", label: "Preferences" },
  { href: "/docs", label: "Docs" },
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  await ensureDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, session.user.id)).limit(1);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <aside className="fixed inset-y-0 left-0 hidden w-60 overflow-y-auto border-r border-white/10 bg-zinc-950/90 p-4 md:block">
        <Link href="/overview" className="mb-8 block text-[15px]">
          <NexusWordmark />
        </Link>
        <p className="mb-6 text-xs text-amber-400/90">
          Saldo {formatUsd(microsToUsd(user?.creditMicros ?? 0), 2)}
        </p>
        <nav className="grid gap-1 text-sm">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-2 py-1.5 text-zinc-400 hover:bg-white/5 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <SignOutButton />
      </aside>
      <div className="md:pl-60">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3 text-sm text-zinc-400 md:hidden">
          <span className="flex min-w-0 items-center gap-2">
            <NexusWordmark markClassName="size-5" />
            <span className="truncate">· {session.user.email}</span>
          </span>
          <SignOutButton compact />
        </div>
        <nav className="flex gap-3 overflow-x-auto border-b border-white/10 px-4 py-2 text-xs text-zinc-400 md:hidden">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="shrink-0 hover:text-white">
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="mx-auto max-w-6xl p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
