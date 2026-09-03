"use client";

import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const PRODUCT = [
  { href: "/models", label: "Modelos", note: "Catálogo 425+" },
  { href: "/chat", label: "Chat", note: "Playground + route trace" },
  { href: "/providers", label: "Providers", note: "Hosts y circuitos" },
  { href: "/rankings", label: "Rankings", note: "Popular · precio · latencia" },
  { href: "/compare", label: "Compare", note: "Side-by-side" },
  { href: "/arena", label: "Arena", note: "A vs B local" },
  { href: "/apps", label: "Apps", note: "Atribución real" },
  { href: "/status", label: "Status", note: "Cables de la instancia" },
];

const COMPANY = [
  { href: "/credits", label: "Credits" },
  { href: "/enterprise", label: "Enterprise" },
  { href: "/blog", label: "Blog" },
  { href: "/docs", label: "Docs" },
];

export function SiteHeaderNav({ light }: { light: boolean }) {
  const muted = light ? "text-zinc-500" : "text-zinc-400";
  const hover = light ? "hover:text-zinc-900" : "hover:text-white";
  const trigger = cn("text-sm outline-none", muted, hover);

  return (
    <nav className={cn("hidden items-center gap-5 text-sm md:flex", muted)}>
      <DropdownMenu>
        <DropdownMenuTrigger className={cn(trigger, "inline-flex items-center gap-1")}>
          Producto
          <span aria-hidden className="text-[10px] opacity-60">
            ▾
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Descubrimiento</DropdownMenuLabel>
          {PRODUCT.map((item) => (
            <DropdownMenuItem key={item.href} asChild>
              <Link href={item.href} className="flex flex-col items-start gap-0.5">
                <span>{item.label}</span>
                <span className="text-[11px] text-muted-foreground">{item.note}</span>
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {COMPANY.map((item) => (
        <Link key={item.href} href={item.href} className={hover}>
          {item.label}
        </Link>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger className={cn(trigger, "md:hidden")}>Más</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuSeparator />
          {[...PRODUCT, ...COMPANY].map((item) => (
            <DropdownMenuItem key={item.href} asChild>
              <Link href={item.href}>{item.label}</Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
