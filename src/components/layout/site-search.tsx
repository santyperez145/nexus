"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Row = { id: string; name: string };

type Hit = {
  type: "model" | "dataset" | "space" | "collection" | "provider";
  path: string;
  title: string;
  href: string;
  scope: "public" | "tenant";
};

const TYPE_LABEL: Record<Hit["type"], string> = {
  model: "modelo",
  dataset: "dataset",
  space: "space",
  collection: "colección",
  provider: "proveedor",
};

export function SiteSearch({ models }: { models: Row[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<Hit[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fallback = useMemo<Hit[]>(() => {
    const query = q.trim().toLowerCase();
    const rows = query
      ? models.filter((m) => `${m.id} ${m.name}`.toLowerCase().includes(query))
      : models;
    return rows.slice(0, 8).map((m) => ({
      type: "model" as const,
      path: m.id,
      title: m.name,
      href: `/models/${m.id}`,
      scope: "public" as const,
    }));
  }, [models, q]);

  const hits = remote ?? fallback;

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

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/v1/search?limit=8&q=${encodeURIComponent(q.trim())}`,
          { signal: controller.signal, headers: { accept: "application/json" } },
        );
        if (!response.ok) return;
        const payload = (await response.json()) as { data?: Hit[] };
        setRemote(Array.isArray(payload.data) ? payload.data.slice(0, 8) : []);
      } catch {
        // The bundled catalog keeps the palette usable while the index is unreachable.
      }
    }, 180);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [open, q]);

  function go(href: string) {
    setOpen(false);
    setQ("");
    setRemote(null);
    router.push(href);
  }

  return (
    <div className="relative w-full max-w-lg">
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          queueMicrotask(() => inputRef.current?.focus());
        }}
        className="flex h-9 w-full items-center gap-2 rounded-full border border-indigo-100 bg-white/80 px-3 text-left text-sm text-zinc-500 shadow-sm shadow-indigo-950/5 transition-all hover:border-indigo-200 hover:bg-white hover:shadow-md"
      >
        <span aria-hidden className="size-1.5 rounded-full bg-cyan-500" />
        <span className="flex-1 truncate">Buscar modelos, datasets, Spaces o proveedores…</span>
        <kbd className="hidden rounded border border-indigo-100 bg-indigo-50/70 px-1.5 py-0.5 font-mono text-[10px] text-indigo-500 sm:inline">
          ⌘K
        </kbd>
      </button>
      {open ? (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-2xl shadow-indigo-950/10">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                go(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : "/search");
              }
            }}
            placeholder="claude, embeddings, nexus-labs/frontier…"
            className="h-11 w-full border-b border-indigo-50 px-3 text-sm outline-none placeholder:text-zinc-400 focus:bg-indigo-50/30"
            autoComplete="off"
          />
          <ul className="max-h-72 overflow-auto py-1">
            {hits.map((hit) => (
              <li key={`${hit.type}:${hit.path}`}>
                <button
                  type="button"
                  className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-indigo-50/60"
                  onClick={() => go(hit.href)}
                >
                  <span className="flex w-full items-center gap-2">
                    <span className="truncate font-medium text-zinc-900">{hit.title}</span>
                    <span className="ml-auto shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[9px] uppercase text-zinc-500">
                      {TYPE_LABEL[hit.type]}
                    </span>
                  </span>
                  <span className="truncate font-mono text-[11px] text-zinc-500">{hit.path}</span>
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-xs text-violet-700 hover:bg-zinc-50"
                onClick={() => go(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : "/search")}
              >
                Ver todos los resultados →
              </button>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
