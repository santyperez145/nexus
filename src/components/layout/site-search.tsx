"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
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
  const [remote, setRemote] = useState<{ query: string; hits: Hit[]; message?: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const query = q.trim();
  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setRemote(null);
  }, []);

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

  const current = remote?.query === query ? remote : null;
  const hits = current?.hits ?? (query.length < 2 ? fallback : []);
  const searchHref = query.length >= 2 ? `/search?q=${encodeURIComponent(query)}` : "/search";

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
      }
      if (e.key === "Escape" && open) {
        close();
        triggerRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, open]);

  useEffect(() => {
    if (!open || query.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/v1/search?limit=8&q=${encodeURIComponent(query)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const payload = (await response.json()) as { data?: Hit[]; meta?: { degraded?: boolean }; error?: { message?: string } };
        if (!response.ok) throw new Error(payload.error?.message ?? "La búsqueda no está disponible.");
        if (!controller.signal.aborted) setRemote({
          query,
          hits: payload.data ?? [],
          message: payload.meta?.degraded ? "Algunas fuentes no respondieron." : undefined,
        });
      } catch {
        if (!controller.signal.aborted) setRemote({ query, hits: [], message: "No se pudo completar la búsqueda." });
      }
    }, 180);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [open, query]);

  function go(href: string) {
    close();
    router.push(href);
  }

  return (
    <div className="relative w-full max-w-lg">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => open ? close() : setOpen(true)}
        className="flex h-9 w-full items-center gap-2 rounded-full border border-indigo-100 bg-white/80 px-3 text-left text-sm text-zinc-500 shadow-sm shadow-indigo-950/5 transition-all hover:border-indigo-200 hover:bg-white hover:shadow-md"
      >
        <span aria-hidden className="size-1.5 rounded-full bg-cyan-500" />
        <span className="flex-1 truncate">Buscar en Nexus</span>
        <kbd className="hidden rounded border border-indigo-100 bg-indigo-50/70 px-1.5 py-0.5 font-mono text-[10px] text-indigo-500 sm:inline">
          ⌘K
        </kbd>
      </button>
      {open ? (
        <div id={panelId} className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-2xl shadow-indigo-950/10">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                go(searchHref);
              }
            }}
            placeholder="Nombre o ruta del recurso"
            maxLength={161}
            aria-label="Nombre o ruta del recurso"
            className="h-11 w-full border-b border-indigo-50 px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-500 focus:bg-indigo-50/30"
            autoComplete="off"
          />
          {query.length >= 2 && (current?.message || !hits.length) ? (
            <p role="status" className="px-3 py-2 text-xs text-zinc-600">
              {current?.message ?? (current ? "Sin coincidencias." : "Buscando…")}
            </p>
          ) : null}
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
                      {TYPE_LABEL[hit.type]}{hit.scope === "tenant" ? " · Privado" : ""}
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
                onClick={() => go(searchHref)}
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
