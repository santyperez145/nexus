import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="nexus-grid min-h-screen bg-[#f8f9ff] text-zinc-900">
      <SiteHeader tone="light" />
      <main>{children}</main>
      <SiteFooter tone="light" />
    </div>
  );
}
