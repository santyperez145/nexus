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
    <footer className={cn("border-t", light ? "border-zinc-200 bg-white" : "border-white/10 bg-zinc-950")}>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className={light ? "text-zinc-950" : "text-zinc-100"}>
            <NexusWordmark tone={light ? "light" : "dark"} />
          </div>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-zinc-500">
            Todos tus modelos de IA en un solo lugar, con costos claros y control compartido.
          </p>
        </div>
        {COLS.map((col) => (
          <div key={col.title} className="grid gap-2 text-sm">
            <div className="font-medium text-zinc-900">{col.title}</div>
            {col.links.map(([href, label]) => (
              <Link
                key={`${col.title}-${href}-${label}`}
                href={href}
                className={light ? "text-zinc-500 hover:text-zinc-950" : "text-zinc-400 hover:text-white"}
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
