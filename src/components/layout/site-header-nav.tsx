"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LINKS = [
  { href: "/models", label: "Modelos" },
  { href: "/datasets", label: "Datasets" },
  { href: "/spaces", label: "Spaces" },
  { href: "/collections", label: "Colecciones" },
  { href: "/providers", label: "Proveedores" },
  { href: "/chat", label: "Playground" },
  { href: "/apps", label: "Apps" },
  { href: "/enterprise", label: "Empresas" },
  { href: "/docs", label: "Docs" },
];

const MORE_LINKS = [
  { href: "/compare", label: "Comparar" },
  { href: "/arena", label: "Arena" },
  { href: "/rankings", label: "Ranking" },
  { href: "/credits", label: "Precios" },
] as const;

export function SiteHeaderNav({ light }: { light: boolean }) {
  return (
    <>
      <nav className={cn("hidden items-center gap-5 text-[13px] font-medium lg:flex", light ? "text-zinc-600" : "text-zinc-400")}>
        {LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={light ? "hover:text-zinc-950" : "hover:text-white"}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Abrir navegación"
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-lg border lg:hidden",
              light
                ? "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                : "border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10",
            )}
          >
            <Menu className="size-4" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52 p-1.5">
          {LINKS.map((item) => (
            <DropdownMenuItem key={item.href} asChild className="px-2.5 py-2">
              <Link href={item.href}>{item.label}</Link>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {MORE_LINKS.map((item) => (
            <DropdownMenuItem key={item.href} asChild className="px-2.5 py-2">
              <Link href={item.href}>{item.label}</Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
