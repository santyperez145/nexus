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
        "sticky top-0 z-40 border-b backdrop-blur-2xl",
        light ? "border-indigo-100/80 bg-[#fbfbff]/90" : "border-white/10 bg-[#090b16]/90",
      )}
    >
      <div className="mx-auto flex h-16 max-w-[90rem] items-center gap-5 px-4 sm:px-6 lg:px-8">
        <Link href="/" className={cn("shrink-0 text-[15px]", light ? "text-[#111326]" : "text-zinc-100")}>
          <NexusWordmark tone={tone} />
        </Link>
        <span
          className={cn(
            "hidden rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] xl:inline-flex",
            light
              ? "border-indigo-200 bg-indigo-50 text-indigo-700"
              : "border-white/15 bg-white/5 text-cyan-300",
          )}
        >
          AI gateway
        </span>
        <div className="hidden min-w-0 flex-1 justify-center md:flex">
          <SiteSearch models={models} />
        </div>
        <SiteHeaderNav light={light} />
        <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
          {session ? (
            <Button asChild size="sm">
              <Link href="/overview">Panel</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className={light ? "text-zinc-700" : undefined}>
                <Link href="/login">Ingresar</Link>
              </Button>
              <Button asChild size="sm" className="rounded-full px-4 shadow-sm shadow-indigo-500/20">
                <Link href="/register">Crear cuenta</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
