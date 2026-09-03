import Link from "next/link";
import { getSession } from "@/lib/auth";
import { allModels } from "@/lib/catalog";
import { Button } from "@/components/ui/button";
import { NexusWordmark } from "@/components/brand/nexus-logo";
import { SiteHeaderNav } from "@/components/layout/site-header-nav";
import { SiteSearch } from "@/components/layout/site-search";
import { cn } from "@/lib/utils";

export async function SiteHeader({ tone = "light" }: { tone?: "dark" | "light" }) {
  const session = await getSession();
  const light = tone === "light";
  const models = allModels()
    .filter((m) => !m.id.startsWith("nexus/"))
    .map((m) => ({ id: m.id, name: m.name }));

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b backdrop-blur-xl",
        light ? "border-zinc-200/80 bg-white/85" : "border-white/10 bg-black/70",
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className={cn("shrink-0 text-[15px]", light ? "text-zinc-900" : "text-zinc-100")}>
          <NexusWordmark tone={tone} />
        </Link>
        <div className="hidden min-w-0 flex-1 justify-center md:flex">
          <SiteSearch models={models} />
        </div>
        <SiteHeaderNav light={light} />
        <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
          {session ? (
            <Button asChild size="sm">
              <Link href="/overview">Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className={light ? "text-zinc-700" : undefined}>
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">Get API Key</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
