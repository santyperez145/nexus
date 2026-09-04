"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SignOutButton } from "@/components/layout/sign-out";

const GROUPS: Array<{ title: string; items: Array<{ href: string; label: string }> }> = [
  {
    title: "Producto",
    items: [
      { href: "/overview", label: "Inicio" },
      { href: "/chat", label: "Chat" },
      { href: "/studio", label: "Estudio multimedia" },
      { href: "/models", label: "Modelos" },
      { href: "/settings/datasets", label: "Hub de datasets" },
    ],
  },
  {
    title: "Uso y facturación",
    items: [
      { href: "/activity", label: "Actividad" },
      { href: "/analytics", label: "Métricas" },
      { href: "/settings/credits", label: "Saldo y plan" },
      { href: "/settings/keys", label: "Claves API" },
      { href: "/settings/byok", label: "Proveedores propios" },
      { href: "/settings/connections", label: "Conexiones" },
    ],
  },
  {
    title: "Seguridad y equipo",
    items: [
      { href: "/settings/account", label: "Cuenta y seguridad" },
      { href: "/settings/privacy", label: "Privacidad" },
      { href: "/settings/guardrails", label: "Reglas de uso" },
      { href: "/settings/observability", label: "Monitoreo" },
      { href: "/settings/workspaces", label: "Espacios de trabajo" },
      { href: "/settings/organizations", label: "Organizaciones" },
      { href: "/settings/files", label: "Archivos" },
    ],
  },
  {
    title: "Más",
    items: [
      { href: "/compare", label: "Comparar" },
      { href: "/rankings", label: "Ranking" },
      { href: "/arena", label: "Arena" },
      { href: "/apps", label: "Apps" },
      { href: "/settings/presets", label: "Configuraciones" },
      { href: "/settings/shares", label: "Compartidos" },
      { href: "/welcome", label: "Primeros pasos" },
      { href: "/settings/notifications", label: "Avisos" },
      { href: "/settings/preferences", label: "Preferencias" },
      { href: "/settings/oauth", label: "Integraciones" },
    ],
  },
];

const MOBILE_PRIMARY = [
  { href: "/overview", label: "Inicio" },
  { href: "/chat", label: "Chat" },
  { href: "/studio", label: "Estudio" },
  { href: "/activity", label: "Actividad" },
  { href: "/settings/keys", label: "Claves" },
];

function isActive(pathname: string, href: string) {
  if (href === "/overview") return pathname === "/overview";
  if (href === "/models") return pathname.startsWith("/models");
  if (href === "/compare") return pathname.startsWith("/compare");
  if (href === "/arena") return pathname.startsWith("/arena");
  return pathname === href || pathname.startsWith(`${href}/`);
}

const activeCls = "bg-indigo-400/15 text-white ring-1 ring-inset ring-indigo-300/15";
const idleCls = "text-zinc-400 hover:bg-white/[0.06] hover:text-white";

export function AppNav({
  variant = "sidebar",
  platformAdmin = false,
  userEmail,
}: {
  variant?: "sidebar" | "mobile";
  platformAdmin?: boolean;
  userEmail?: string;
}) {
  const pathname = usePathname() || "/overview";
  const [open, setOpen] = useState(false);
  const groups = platformAdmin
    ? [...GROUPS, { title: "Plataforma", items: [{ href: "/admin", label: "Superadmin" }] }]
    : GROUPS;

  if (variant === "mobile") {
    return (
      <div className="border-b border-white/10 bg-[#0b0e1a] md:hidden">
        <nav className="flex items-center gap-1 overflow-x-auto px-3 py-2 text-xs">
          {MOBILE_PRIMARY.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 rounded-md px-2.5 py-1.5 ${active ? activeCls : idleCls}`}
              >
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={`ml-auto shrink-0 rounded-md px-2.5 py-1.5 ${open ? activeCls : idleCls}`}
            aria-expanded={open}
          >
            Más
          </button>
        </nav>
        {open ? (
          <div className="max-h-[60vh] space-y-4 overflow-y-auto border-t border-white/10 bg-[#0b0e1a] px-3 py-3 text-sm">
            {groups.map((group) => (
              <div key={group.title}>
                <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                  {group.title}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`rounded-md px-2 py-1.5 ${
                        isActive(pathname, item.href) ? activeCls : idleCls
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
                Estado
              </Link>
              <Link href="/docs" onClick={() => setOpen(false)} className="rounded-md px-2 py-1.5 text-zinc-400">
                Documentación
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
        {groups.map((group) => (
          <div key={group.title}>
            <div className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
              {group.title}
            </div>
            <div className="grid gap-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-md px-2 py-1.5 transition-colors ${active ? activeCls : idleCls}`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
        <div>
          <div className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">Ayuda</div>
          <Link
            href="/status"
            className={`block rounded-md px-2 py-1.5 ${pathname.startsWith("/status") ? activeCls : idleCls}`}
          >
            Estado del servicio
          </Link>
          <Link
            href="/docs"
            className={`block rounded-md px-2 py-1.5 ${pathname.startsWith("/docs") ? activeCls : idleCls}`}
          >
            Documentación API
          </Link>
        </div>
      </nav>
      {userEmail ? (
        <Link
          href="/settings/account"
          className={`rounded-xl border px-3 py-2 transition-colors ${
            pathname === "/settings/account"
              ? "border-indigo-400/40 bg-indigo-400/10"
              : "border-white/10 bg-white/[0.04] hover:border-white/20"
          }`}
        >
          <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">Cuenta</div>
          <div className="mt-0.5 truncate text-xs text-zinc-300" title={userEmail}>{userEmail}</div>
        </Link>
      ) : null}
      <SignOutButton />
    </div>
  );
}
