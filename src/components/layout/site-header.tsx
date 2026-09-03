import Link from "next/link";
import { getSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { NexusWordmark } from "@/components/brand/nexus-logo";

export async function SiteHeader() {
  const session = await getSession();
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-black/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-[15px]">
          <NexusWordmark />
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-zinc-400 md:flex">
          <Link href="/models" className="hover:text-white">
            Modelos
          </Link>
          <Link href="/chat" className="hover:text-white">
            Chat
          </Link>
          <Link href="/providers" className="hover:text-white">
            Providers
          </Link>
          <Link href="/rankings" className="hover:text-white">
            Rankings
          </Link>
          <Link href="/docs" className="hover:text-white">
            Docs
          </Link>
          <Link href="/privacy" className="hover:text-white">
            Privacidad
          </Link>
          {session ? (
            <Link href="/overview" className="hover:text-white">
              App
            </Link>
          ) : null}
        </nav>
        <div className="flex items-center gap-2">
          {session ? (
            <Button asChild size="sm">
              <Link href="/overview">Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Entrar</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">Crear cuenta</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
