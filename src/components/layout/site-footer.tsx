import Link from "next/link";
import { cn } from "@/lib/utils";
import { NexusWordmark } from "@/components/brand/nexus-logo";

const COLS = [
  {
    title: "Product",
    links: [
      ["/chat", "Chat"],
      ["/models", "Models"],
      ["/rankings", "Rankings"],
      ["/compare", "Compare"],
      ["/arena", "Arena"],
      ["/apps", "Apps"],
      ["/providers", "Providers"],
      ["/credits", "Pricing"],
      ["/enterprise", "Enterprise"],
    ],
  },
  {
    title: "Company",
    links: [
      ["/blog", "Blog"],
      ["/privacy", "Privacy"],
      ["/terms", "Terms"],
      ["/status", "Status"],
    ],
  },
  {
    title: "Developer",
    links: [
      ["/docs", "Documentation"],
      ["/docs", "API Reference"],
      ["/status", "Status"],
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
            Una API para cada modelo. Routing, fallbacks, créditos por token y BYOK.
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
