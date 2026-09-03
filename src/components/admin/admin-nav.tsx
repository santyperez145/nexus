"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/finance", label: "Finanzas" },
  { href: "/admin/users", label: "Usuarios" },
  { href: "/admin/operations", label: "Operaciones" },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Superadmin" className="mb-8 flex gap-1 overflow-x-auto border-b border-zinc-200">
      {ITEMS.map((item) => {
        const active = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm transition-colors ${
              active
                ? "border-violet-600 font-medium text-zinc-950"
                : "border-transparent text-zinc-500 hover:text-zinc-950"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
