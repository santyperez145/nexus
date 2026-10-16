import Link from "next/link";
import { Boxes, Bookmark, Database, LockKeyhole, Search, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { ensureDb } from "@/lib/db";
import { sessionAuthContext } from "@/lib/gateway/api-auth";
import { hubSearch, hubSearchTypes, type HubSearchType } from "@/lib/hub/search";

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
    "Buscá modelos ejecutables, datasets versionados, Spaces, colecciones y proveedores en un único índice.",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  await ensureDb();
  const filters = await searchParams;
  const session = await getSession();
  const auth = session?.user ? await sessionAuthContext(session.user.id) : null;
  const type = parseType(filters.type);
  const query = (filters.q ?? "").slice(0, 120);
  const result = await hubSearch({
    auth,
    query,
    types: type ? [type] : undefined,
    limit: type ? 50 : 12,
  });
  const total = Object.values(result.counts).reduce((sum, value) => sum + value, 0);

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
          Un solo índice para el catálogo ejecutable multi‑proveedor, el Hub versionado y los
          proveedores conectados. Los recursos privados aparecen únicamente para su tenant.
        </MarketingPageHeader>

        <form className="mt-7 grid gap-3 rounded-2xl border border-indigo-950/10 bg-white p-3 shadow-sm sm:grid-cols-[1fr_auto]">
          <input
            name="q"
            defaultValue={query}
            placeholder="claude, embeddings, nexus-labs/frontier…"
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
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
              type
                ? "border border-zinc-200 bg-white text-zinc-600 hover:border-indigo-300"
                : "bg-[#111326] text-white"
            }`}
          >
            Todo · {total}
          </Link>
          {hubSearchTypes.map((item) => (
            <Link
              key={item}
              href={href(item)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                type === item
                  ? "bg-[#111326] text-white"
                  : "border border-zinc-200 bg-white text-zinc-600 hover:border-indigo-300"
              }`}
            >
              {TYPE_LABEL[item]} · {result.counts[item]}
            </Link>
          ))}
        </div>

        {result.degraded ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            Parte del índice no respondió. Los resultados mostrados son parciales.
          </p>
        ) : null}

        <div className="mt-5 grid gap-3">
          {result.hits.map((hit) => {
            const Icon = TYPE_ICON[hit.type];
            return (
              <Link
                key={`${hit.type}:${hit.path}`}
                href={hit.href}
                className="group rounded-2xl border border-indigo-950/10 bg-white p-5 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-[0_15px_40px_rgba(17,19,38,0.07)]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Icon className="size-4 text-indigo-600" aria-hidden />
                  <span className="truncate font-mono text-xs text-indigo-700">{hit.path}</span>
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-zinc-500">
                    {hit.type}
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
                  {hit.executable ? (
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">
                      ejecutable
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
          {!result.hits.length ? (
            <div className="rounded-2xl border border-dashed border-indigo-200 bg-white px-6 py-16 text-center">
              <Search className="mx-auto size-7 text-indigo-300" />
              <h2 className="mt-3 font-semibold text-zinc-900">Sin resultados</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Probá otro término o explorá el <Link href="/models" className="text-indigo-700">catálogo</Link>.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </MarketingShell>
  );
}
