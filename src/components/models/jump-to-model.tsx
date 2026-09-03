"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Row = { id: string; name: string };

export function JumpToModel({ models }: { models: Row[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const hits = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return models
      .filter((m) => `${m.id} ${m.name}`.toLowerCase().includes(query))
      .slice(0, 8);
  }, [models, q]);

  function go(id: string, dest: "model" | "chat") {
    setOpen(false);
    setQ("");
    router.push(dest === "chat" ? `/chat?model=${encodeURIComponent(id)}` : `/models/${id}`);
  }

  return (
    <div className="relative mx-auto w-full max-w-md">
      <label className="sr-only" htmlFor="jump-model">
        Ir a un modelo
      </label>
      <input
        id="jump-model"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && hits[0]) {
            e.preventDefault();
            go(hits[0].id, "model");
          }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Buscar modelo… openai/gpt-4o"
        className="h-11 w-full rounded-md border border-zinc-300 bg-white/90 px-4 text-sm text-zinc-900 shadow-sm backdrop-blur placeholder:text-zinc-400"
        autoComplete="off"
      />
      {open && hits.length ? (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
          {hits.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-amber-50">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => go(m.id, "model")}
              >
                <div className="truncate font-mono text-xs text-amber-700">{m.id}</div>
                <div className="truncate text-xs text-zinc-500">{m.name}</div>
              </button>
              <button
                type="button"
                className="shrink-0 text-[11px] text-zinc-500 hover:text-amber-700"
                onClick={() => go(m.id, "chat")}
              >
                chat
              </button>
            </li>
          ))}
          <li className="border-t border-zinc-100 px-3 py-2 text-[11px] text-zinc-400">
            <Link href={`/models?q=${encodeURIComponent(q)}`} className="hover:text-amber-700">
              Ver catálogo completo →
            </Link>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
