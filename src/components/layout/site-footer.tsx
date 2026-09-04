import Link from "next/link";
import { cn } from "@/lib/utils";
import { NexusWordmark } from "@/components/brand/nexus-logo";

const COLS = [
  {
    title: "Producto",
    links: [
      ["/chat", "Chat"],
      ["/models", "Modelos"],
      ["/rankings", "Ranking"],
      ["/compare", "Comparar"],
      ["/arena", "Arena"],
      ["/apps", "Apps"],
      ["/providers", "Proveedores"],
      ["/credits", "Precios"],
      ["/enterprise", "Equipos"],
    ],
  },
  {
    title: "Compañía",
    links: [
      ["/blog", "Blog"],
      ["/privacy", "Privacidad"],
      ["/terms", "Términos"],
      ["/status", "Estado"],
    ],
  },
  {
    title: "Desarrolladores",
    links: [
      ["/docs", "Documentación"],
      ["/docs", "Referencia de API"],
      ["/status", "Estado"],
    ],
  },
] as const;

export function SiteFooter({ tone = "light" }: { tone?: "dark" | "light" }) {
  const light = tone === "light";
  return (
    <footer className={cn("border-t", light ? "border-indigo-950/10 bg-[#0b0e1a]" : "border-white/10 bg-[#080a13]")}>
      <div className="nexus-console-grid mx-auto grid max-w-[90rem] gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
        <div>
          <div className="text-zinc-100">
            <NexusWordmark tone="dark" />
          </div>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-zinc-400">
            Infraestructura neutral para descubrir, ejecutar y gobernar modelos de múltiples proveedores.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300">
            <span className="size-1.5 rounded-full bg-cyan-400" />
            Gateway independiente
          </div>
        </div>
        {COLS.map((col) => (
          <div key={col.title} className="grid gap-2 text-sm">
            <div className="font-medium text-zinc-100">{col.title}</div>
            {col.links.map(([href, label]) => (
              <Link
                key={`${col.title}-${href}-${label}`}
                href={href}
                className="text-zinc-400 transition-colors hover:text-white"
              >
                {label}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </footer>
  );
}
