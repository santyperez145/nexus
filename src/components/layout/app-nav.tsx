"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/layout/sign-out";

const GROUPS: Array<{ title: string; items: Array<{ href: string; label: string }> }> = [
  {
    title: "Playground",
    items: [
      { href: "/overview", label: "Overview" },
      { href: "/chat", label: "Chat" },
      { href: "/studio", label: "Studio" },
      { href: "/models", label: "Models" },
      { href: "/rankings", label: "Rankings" },
    ],
  },
  {
    title: "Uso",
    items: [
      { href: "/activity", label: "Activity" },
      { href: "/analytics", label: "Analytics" },
      { href: "/settings/credits", label: "Credits" },
      { href: "/settings/files", label: "Files" },
    ],
  },
  {
    title: "Cuenta",
    items: [
      { href: "/settings/keys", label: "API Keys" },
      { href: "/settings/connections", label: "Conexiones" },
      { href: "/settings/byok", label: "BYOK" },
      { href: "/settings/presets", label: "Presets" },
      { href: "/settings/privacy", label: "Privacy" },
      { href: "/settings/preferences", label: "Preferences" },
    ],
  },
  {
    title: "Equipo",
    items: [
      { href: "/settings/guardrails", label: "Guardrails" },
      { href: "/settings/observability", label: "Observability" },
      { href: "/settings/oauth", label: "OAuth" },
      { href: "/settings/workspaces", label: "Workspaces" },
      { href: "/settings/organizations", label: "Organizations" },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/overview") return pathname === "/overview";
  if (href === "/models") return pathname.startsWith("/models");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav({ variant = "sidebar" }: { variant?: "sidebar" | "mobile" }) {
  const pathname = usePathname() || "/overview";

  if (variant === "mobile") {
    const flat = GROUPS.flatMap((g) => g.items);
    return (
      <nav className="flex gap-1 overflow-x-auto border-b border-white/10 px-3 py-2 text-xs md:hidden">
        {flat.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 rounded-md px-2.5 py-1.5 ${
                active ? "bg-amber-400/15 text-amber-200" : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
        <Link href="/docs" className="shrink-0 rounded-md px-2.5 py-1.5 text-zinc-500 hover:text-zinc-200">
          Docs
        </Link>
      </nav>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav className="flex-1 space-y-5 overflow-y-auto pb-4 text-sm">
        {GROUPS.map((group) => (
          <div key={group.title}>
            <div className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-600">
              {group.title}
            </div>
            <div className="grid gap-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-md px-2 py-1.5 transition-colors ${
                      active
                        ? "bg-white/[0.06] text-amber-300"
                        : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
        <div>
          <div className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-600">
            Docs
          </div>
          <Link
            href="/status"
            className={`block rounded-md px-2 py-1.5 ${
              pathname.startsWith("/status")
                ? "bg-white/[0.06] text-amber-300"
                : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100"
            }`}
          >
            Status
          </Link>
          <Link
            href="/docs"
            className={`block rounded-md px-2 py-1.5 ${
              pathname.startsWith("/docs")
                ? "bg-white/[0.06] text-amber-300"
                : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100"
            }`}
          >
            API reference
          </Link>
        </div>
      </nav>
      <SignOutButton />
    </div>
  );
}
