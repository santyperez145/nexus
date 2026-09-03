import Link from "next/link";
import { getSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { NexusWordmark } from "@/components/brand/nexus-logo";
import { SiteHeaderNav } from "@/components/layout/site-header-nav";
import { cn } from "@/lib/utils";

export async function SiteHeader({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const session = await getSession();
  const light = tone === "light";
  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b backdrop-blur-xl",
        light ? "border-zinc-200/80 bg-white/80" : "border-white/10 bg-black/70",
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className={cn("text-[15px]", light ? "text-zinc-900" : "text-zinc-100")}>
          <NexusWordmark tone={tone} />
        </Link>
        <SiteHeaderNav light={light} />
        <div className="flex items-center gap-2">
          {session ? (
            <Button
              asChild
              size="sm"
              className={light ? "bg-zinc-900 text-white hover:bg-zinc-800" : undefined}
            >
              <Link href="/overview">Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className={light ? "text-zinc-700 hover:bg-zinc-100" : undefined}>
                <Link href="/login">Entrar</Link>
              </Button>
              <Button
                asChild
                size="sm"
                className={light ? "bg-amber-600 text-white hover:bg-amber-700" : undefined}
              >
                <Link href="/register">Crear cuenta</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
