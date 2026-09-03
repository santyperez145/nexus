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
    <div className="relative min-h-screen bg-zinc-950 text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(245,158,11,0.07),transparent_42%),radial-gradient(ellipse_at_bottom_right,rgba(255,255,255,0.03),transparent_40%)]"
      />
      <SiteHeader tone="dark" />
      <main className="relative mx-auto max-w-6xl p-4 md:p-8">{children}</main>
      <SiteFooter tone="dark" />
    </div>
  );
}
