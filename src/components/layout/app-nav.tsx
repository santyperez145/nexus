"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SignOutButton } from "@/components/layout/sign-out";

const GROUPS: Array<{ title: string; items: Array<{ href: string; label: string }> }> = [
  {
    title: "Gateway",
    items: [
      { href: "/overview", label: "Overview" },
      { href: "/chat", label: "Chat" },
      { href: "/studio", label: "Studio" },
      { href: "/models", label: "Models" },
    ],
  },
  {
    title: "Operación",
    items: [
      { href: "/activity", label: "Activity" },
      { href: "/analytics", label: "Analytics" },
      { href: "/settings/credits", label: "Credits" },
      { href: "/settings/keys", label: "API Keys" },
      { href: "/settings/byok", label: "BYOK" },
      { href: "/settings/connections", label: "Conexiones" },
    ],
  },
  {
    title: "Política",
    items: [
      { href: "/settings/privacy", label: "Privacy" },
      { href: "/settings/guardrails", label: "Guardrails" },
      { href: "/settings/observability", label: "Observability" },
      { href: "/settings/workspaces", label: "Workspaces" },
      { href: "/settings/organizations", label: "Organizations" },
      { href: "/settings/files", label: "Files" },
    ],
  },
  {
    title: "Explorar",
    items: [
      { href: "/compare", label: "Compare" },
      { href: "/rankings", label: "Rankings" },
      { href: "/arena", label: "Arena" },
      { href: "/apps", label: "Apps" },
      { href: "/settings/presets", label: "Presets" },
      { href: "/settings/shares", label: "Shares" },
      { href: "/welcome", label: "Welcome" },
      { href: "/settings/notifications", label: "Notifications" },
      { href: "/settings/preferences", label: "Preferences" },
      { href: "/settings/oauth", label: "OAuth" },
    ],
  },
];

const MOBILE_PRIMARY = [
  { href: "/overview", label: "Overview" },
  { href: "/chat", label: "Chat" },
  { href: "/studio", label: "Studio" },
  { href: "/activity", label: "Activity" },
  { href: "/settings/keys", label: "Keys" },
];

function isActive(pathname: string, href: string) {
  if (href === "/overview") return pathname === "/overview";
  if (href === "/models") return pathname.startsWith("/models");
  if (href === "/compare") return pathname.startsWith("/compare");
  if (href === "/arena") return pathname.startsWith("/arena");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav({ variant = "sidebar" }: { variant?: "sidebar" | "mobile" }) {
  const pathname = usePathname() || "/overview";
  const [open, setOpen] = useState(false);

  if (variant === "mobile") {
    return (
      <div className="border-b border-white/10 md:hidden">
        <nav className="flex items-center gap-1 px-3 py-2 text-xs">
          {MOBILE_PRIMARY.map((item) => {
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
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={`ml-auto shrink-0 rounded-md px-2.5 py-1.5 ${
              open ? "bg-white/10 text-zinc-100" : "text-zinc-500 hover:text-zinc-200"
            }`}
            aria-expanded={open}
          >
            Más
          </button>
        </nav>
        {open ? (
          <div className="max-h-[60vh] space-y-4 overflow-y-auto border-t border-white/10 bg-zinc-950/95 px-3 py-3 text-sm backdrop-blur">
            {GROUPS.map((group) => (
              <div key={group.title}>
                <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-600">
                  {group.title}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`rounded-md px-2 py-1.5 ${
                        isActive(pathname, item.href)
                          ? "bg-white/[0.06] text-amber-300"
                          : "text-zinc-400 hover:bg-white/[0.04]"
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-1 border-t border-white/10 pt-3">
              <Link href="/status" onClick={() => setOpen(false)} className="rounded-md px-2 py-1.5 text-zinc-400">
                Status
              </Link>
              <Link href="/docs" onClick={() => setOpen(false)} className="rounded-md px-2 py-1.5 text-zinc-400">
                Docs
              </Link>
              <Link href="/compare" onClick={() => setOpen(false)} className="rounded-md px-2 py-1.5 text-zinc-400">
                Compare
              </Link>
            </div>
          </div>
        ) : null}
      </div>
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
