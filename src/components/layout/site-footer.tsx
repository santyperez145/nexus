import Link from "next/link";
import { cn } from "@/lib/utils";

export function SiteFooter({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const light = tone === "light";
  return (
    <footer className={cn("border-t", light ? "border-zinc-200 bg-[#fafaf9]" : "border-white/10")}>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <div
            className={cn(
              "font-[family-name:var(--font-syne)] text-lg font-semibold tracking-tight",
              light ? "text-zinc-950" : "text-zinc-100",
            )}
          >
            Nexus
          </div>
          <p className={cn("mt-2 max-w-xs text-sm leading-relaxed", light ? "text-zinc-500" : "text-zinc-500")}>
            Gateway propio de modelos. OpenAI-compatible. Fee solo al cargar créditos.
          </p>
        </div>
        <div className="grid gap-2 text-sm">
          <div className={light ? "text-zinc-400" : "text-zinc-600"}>Producto</div>
          {(
            [
              ["/models", "Modelos"],
              ["/providers", "Providers"],
              ["/rankings", "Rankings"],
              ["/compare", "Compare"],
              ["/credits", "Credits"],
              ["/enterprise", "Enterprise"],
              ["/blog", "Blog"],
              ["/apps", "Apps"],
              ["/status", "Status"],
              ["/chat", "Chat"],
              ["/docs", "API"],
            ] as const
          ).map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={light ? "text-zinc-600 hover:text-zinc-950" : "text-zinc-400 hover:text-white"}
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="grid gap-2 text-sm">
          <div className={light ? "text-zinc-400" : "text-zinc-600"}>Legal</div>
          <Link
            href="/privacy"
            className={light ? "text-zinc-600 hover:text-zinc-950" : "text-zinc-400 hover:text-white"}
          >
            Privacidad
          </Link>
          <Link
            href="/terms"
            className={light ? "text-zinc-600 hover:text-zinc-950" : "text-zinc-400 hover:text-white"}
          >
            Términos
          </Link>
        </div>
      </div>
    </footer>
  );
}
