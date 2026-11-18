import Link from "next/link";
import { headers } from "next/headers";
import { Boxes, Bookmark, Database, LockKeyhole, Search, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { Button } from "@/components/ui/button";
import { hubSearchTypes, type HubSearchHit, type HubSearchType } from "@/lib/hub/search";
import { searchHubResponse } from "@/lib/hub/search-request";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<HubSearchType, string> = {
  model: "Modelos",
  dataset: "Datasets",
  space: "Spaces",
  collection: "Colecciones",
  provider: "Proveedores",
};

const TYPE_ICON = {
  model: Sparkles,
  dataset: Database,
  space: Boxes,
  collection: Bookmark,
  provider: Workflow,
} as const;

function parseType(raw?: string): HubSearchType | null {
  return hubSearchTypes.includes(raw as HubSearchType) ? (raw as HubSearchType) : null;
}

export const metadata = {
  title: "Buscar en Nexus",
  description:
    "Buscá modelos, datasets, Spaces, colecciones y proveedores.",
  robots: { index: false },
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; type?: string | string[] }>;
}) {
  const { q, type: selected } = await searchParams;
  const type = parseType(Array.isArray(selected) ? selected[0] : selected);
  const query = (Array.isArray(q) ? q[0] ?? "" : q ?? "").trim();
  let result: { data: HubSearchHit[]; meta: { degraded: boolean; truncated: boolean } } | undefined;
  let error: string | undefined;
  if (query) {
    const url = new URL("https://nexus.internal/api/v1/search");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "50");
    if (type) url.searchParams.set("type", type);
    const response = await searchHubResponse(new Request(url, { headers: new Headers(await headers()) }));
    if (response.ok) result = await response.json();
    else error = (await response.json()).error.message;
  }

  function href(next: HubSearchType | null) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (next) params.set("type", next);
    const search = params.toString();
    return search ? `/search?${search}` : "/search";
  }

  return (
    <MarketingShell>
      <div className="relative mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-8 h-44 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.10),_transparent_68%)]"
        />
        <MarketingPageHeader title="Buscar en Nexus">
          Encontrá modelos, datasets, Spaces, colecciones y proveedores.
        </MarketingPageHeader>

        <form className="mt-7 grid gap-3 rounded-2xl border border-indigo-950/10 bg-white p-3 shadow-sm sm:grid-cols-[1fr_auto]">
          <input
            name="q"
            defaultValue={query.slice(0, 161)}
            minLength={2}
            maxLength={161}
            required
            placeholder="Nombre o ruta del recurso"
            aria-label="Buscar en Nexus"
            className="h-10 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
          {type ? <input type="hidden" name="type" value={type} /> : null}
          <Button type="submit" className="h-10 px-5">
            <Search className="mr-1 size-4" />
            Buscar
          </Button>
        </form>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Link
            href={href(null)}
            prefetch={false}
            aria-current={!type ? "page" : undefined}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
              type
                ? "border border-zinc-200 bg-white text-zinc-600 hover:border-indigo-300"
                : "bg-[#111326] text-white"
            }`}
          >
            Todo
          </Link>
          {hubSearchTypes.map((item) => (
            <Link
              key={item}
              href={href(item)}
              prefetch={false}
              aria-current={type === item ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                type === item
                  ? "bg-[#111326] text-white"
                  : "border border-zinc-200 bg-white text-zinc-600 hover:border-indigo-300"
              }`}
            >
              {TYPE_LABEL[item]}
            </Link>
          ))}
        </div>

        {result?.meta.degraded || error ? (
          <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {error ?? "Algunas fuentes no respondieron. Se muestran resultados parciales."}
          </p>
        ) : null}

        {result?.data.length ? <p className="mt-5 text-sm text-zinc-600">
          {result.data.length} {result.data.length === 1 ? "resultado" : "resultados"}
          {result.meta.truncated ? " · Acotá la búsqueda para encontrar más coincidencias." : ""}
        </p> : null}

        <div className="mt-5 grid gap-3">
          {result?.data.map((hit) => {
            const Icon = TYPE_ICON[hit.type];
            return (
              <Link
                key={`${hit.type}:${hit.path}`}
                href={hit.href}
                prefetch={false}
                className="group rounded-2xl border border-indigo-950/10 bg-white p-5 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-[0_15px_40px_rgba(17,19,38,0.07)]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Icon className="size-4 text-indigo-600" aria-hidden />
                  <span className="truncate font-mono text-xs text-indigo-700">{hit.path}</span>
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-zinc-500">
                    {TYPE_LABEL[hit.type]}
                  </span>
                  {hit.verified ? (
                    <ShieldCheck className="size-4 text-cyan-600" aria-label="Verificado" />
                  ) : null}
                  {hit.scope === "tenant" ? (
                    <span className="flex items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-700">
                      <LockKeyhole className="size-3" aria-hidden />
                      privado
                    </span>
                  ) : null}
                  {hit.type === "provider" && hit.executable ? (
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">
                      Operativo
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-3 text-base font-semibold text-[#111326]">{hit.title}</h2>
                <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-zinc-500">
                  {hit.description || "Sin descripción."}
                </p>
              </Link>
            );
          })}
          {!error && !result?.data.length ? (
            <div className="rounded-2xl border border-dashed border-indigo-200 bg-white px-6 py-16 text-center">
              <Search className="mx-auto size-7 text-indigo-300" />
              <h2 className="mt-3 font-semibold text-zinc-900">{query ? "Sin coincidencias" : "¿Qué estás buscando?"}</h2>
              <p className="mt-1 text-sm text-zinc-500">
                {query ? "Probá otro término o elegí otro tipo de recurso." : "Ingresá un nombre o explorá el catálogo."} <Link href="/models" className="text-indigo-700">Ver modelos</Link>
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </MarketingShell>
  );
}
