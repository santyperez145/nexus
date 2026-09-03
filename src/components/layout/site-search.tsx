"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Row = { id: string; name: string };

export function SiteSearch({ models }: { models: Row[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const hits = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) {
      return models.slice(0, 8);
    }
    return models.filter((m) => `${m.id} ${m.name}`.toLowerCase().includes(query)).slice(0, 8);
  }, [models, q]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        queueMicrotask(() => inputRef.current?.focus());
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function go(href: string) {
    setOpen(false);
    setQ("");
    router.push(href);
  }

  return (
    <div className="relative w-full max-w-md">
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          queueMicrotask(() => inputRef.current?.focus());
        }}
        className="flex h-9 w-full items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 text-left text-sm text-zinc-500 transition-colors hover:border-zinc-300 hover:bg-white"
      >
        <span className="flex-1 truncate">Buscar modelos…</span>
        <kbd className="hidden rounded border border-zinc-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 sm:inline">
          ⌘K
        </kbd>
      </button>
      {open ? (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hits[0]) {
                e.preventDefault();
                go(`/models/${hits[0].id}`);
              }
            }}
            placeholder="openai/gpt-4o, claude, groq…"
            className="h-10 w-full border-b border-zinc-100 px-3 text-sm outline-none"
            autoComplete="off"
          />
          <ul className="max-h-72 overflow-auto py-1">
            {hits.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-zinc-50"
                  onClick={() => go(`/models/${m.id}`)}
                >
                  <span className="font-medium text-zinc-900">{m.name}</span>
                  <span className="font-mono text-[11px] text-zinc-500">{m.id}</span>
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-xs text-violet-700 hover:bg-zinc-50"
                onClick={() => go(q ? `/models?q=${encodeURIComponent(q)}` : "/models")}
              >
                Ver todos los modelos →
              </button>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
