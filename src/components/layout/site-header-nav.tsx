"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/models", label: "Models" },
  { href: "/chat", label: "Chat" },
  { href: "/rankings", label: "Rankings" },
  { href: "/apps", label: "Apps" },
  { href: "/enterprise", label: "Enterprise" },
  { href: "/docs", label: "Docs" },
];

export function SiteHeaderNav({ light }: { light: boolean }) {
  return (
    <nav className={cn("hidden items-center gap-5 text-sm lg:flex", light ? "text-zinc-600" : "text-zinc-400")}>
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
  );
}
