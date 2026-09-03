import { AppShell } from "@/components/layout/app-shell";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (session?.user) {
    return <AppShell>{children}</AppShell>;
  }
  return (
    <div className="relative min-h-screen bg-white text-zinc-900">
      <SiteHeader tone="light" />
      <main className="relative mx-auto max-w-6xl p-4 md:p-8">{children}</main>
      <SiteFooter tone="light" />
    </div>
  );
}
