import Link from "next/link";
import { cn } from "@/lib/utils";

export function SiteFooter({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const light = tone === "light";
  return (
    <footer className={cn("border-t", light ? "border-zinc-200" : "border-white/10")}>
      <div
        className={cn(
          "mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-2 px-4 py-8 text-sm",
          light ? "text-zinc-500" : "text-zinc-500",
        )}
      >
        <Link href="/models" className={light ? "hover:text-zinc-900" : "hover:text-white"}>
          Modelos
        </Link>
        <Link href="/providers" className={light ? "hover:text-zinc-900" : "hover:text-white"}>
          Providers
        </Link>
        <Link href="/rankings" className={light ? "hover:text-zinc-900" : "hover:text-white"}>
          Rankings
        </Link>
        <Link href="/docs" className={light ? "hover:text-zinc-900" : "hover:text-white"}>
          API
        </Link>
        <Link href="/privacy" className={light ? "hover:text-zinc-900" : "hover:text-white"}>
          Privacidad
        </Link>
        <Link href="/terms" className={light ? "hover:text-zinc-900" : "hover:text-white"}>
          Términos
        </Link>
      </div>
    </footer>
  );
}
