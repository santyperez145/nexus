import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { RECIPES } from "@/lib/apps/recipes";
import { db, ensureDb, schema } from "@/lib/db";
import { formatUsd, microsToUsd } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function AppsPage() {
  await ensureDb();
  const publicRecipes = RECIPES.filter((recipe) => recipe.slug !== "guest-playground");
  const rows = await db
    .select({
      title: schema.generations.appTitle,
      referer: schema.generations.appReferer,
      requests: sql<number>`count(*)`,
      tokens: sql<number>`sum(${schema.generations.promptTokens} + ${schema.generations.completionTokens})`,
      cost: sql<number>`sum(${schema.generations.costMicros})`,
      last: sql<Date>`max(${schema.generations.createdAt})`,
    })
    .from(schema.generations)
    .groupBy(schema.generations.appTitle, schema.generations.appReferer)
    .orderBy(desc(sql`count(*)`))
    .limit(100);

  const apps = rows
    .map((r) => ({
      name: r.title?.trim() || "Untitled app",
      referer: r.referer?.trim() || null,
      requests: Number(r.requests ?? 0),
      tokens: Number(r.tokens ?? 0),
      cost: microsToUsd(Number(r.cost ?? 0)),
    }))
    .filter((a) => a.requests > 0);

  const totalReq = apps.reduce((s, a) => s + a.requests, 0);

  return (
    <MarketingShell>
      <div className="relative mx-auto max-w-5xl px-4 py-12 md:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-6 h-40 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.08),_transparent_70%)]"
        />
        <MarketingPageHeader title="Apps y plantillas">
          Empezá con experiencias listas para adaptar: asistentes, automatizaciones, búsqueda y
          generación multimedia sobre un único catálogo de modelos. Para publicar una experiencia
          ejecutable y compartible, usá <Link href="/spaces" className="text-indigo-700 hover:underline">Nexus Spaces</Link>.
        </MarketingPageHeader>

        <div className="mb-10 grid gap-3 sm:grid-cols-3">
          {[
            { k: "Plantillas listas", v: String(publicRecipes.length) },
            { k: "Apps publicadas", v: String(apps.length) },
            { k: "Ejecuciones", v: totalReq.toLocaleString() },
          ].map((s) => (
            <div key={s.k} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">{s.k}</div>
              <div className="mt-1 text-2xl font-semibold text-zinc-900">
                {s.v}
              </div>
            </div>
          ))}
        </div>

        <section className="mb-12">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-zinc-950">Explorá por caso de uso</h2>
              <p className="mt-1 text-sm text-zinc-500">Abrí una plantilla, elegí un modelo y probala en Chat.</p>
            </div>
            <Link href="/chat" className="text-sm font-medium text-violet-700 hover:text-violet-800">Abrir Chat →</Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {publicRecipes.map((r) => (
              <Link
                key={r.slug}
                href={`/apps/${r.slug}`}
                className="group rounded-2xl border border-zinc-200 bg-white px-5 py-5 transition-all hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_12px_35px_rgba(24,24,27,0.06)]"
              >
                <div className="font-semibold text-zinc-900 group-hover:text-zinc-950">
                  {r.title}
                </div>
                <p className="mt-1 text-sm text-zinc-500">{r.blurb}</p>
                <div className="mt-5 flex items-center justify-between text-xs">
                  <span className="rounded-full bg-violet-50 px-2 py-1 font-medium text-violet-700">Lista para adaptar</span>
                  <span className="font-medium text-violet-700 transition-transform group-hover:translate-x-0.5">Ver plantilla →</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-1 text-xl font-semibold text-zinc-950">Apps de la comunidad</h2>
          <p className="mb-5 text-sm text-zinc-500">Productos que identifican públicamente su uso de Nexus.</p>
          {!apps.length ? (
            <div className="rounded-xl border border-dashed border-zinc-200 bg-white px-4 py-12 text-center text-sm text-zinc-500">
              <div className="mx-auto max-w-sm text-base font-medium text-zinc-800">Próximamente, productos creados con Nexus.</div>
              <p className="mx-auto mt-2 max-w-md">Cuando una app pública se identifique, aparecerá acá con métricas agregadas y verificables.</p>
              <div className="mt-4">
                <Link href="/docs" className="text-violet-700 hover:underline">
                  Cómo publicar tu app →
                </Link>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
              <div className="grid grid-cols-[1fr_5rem_6rem_6rem] gap-3 border-b border-zinc-200 bg-zinc-50/80 px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-zinc-500 md:grid-cols-[1fr_1fr_5rem_6rem_6rem]">
                <span>App</span>
                <span className="hidden md:block">Referer</span>
                <span className="text-right">Req</span>
                <span className="text-right">Tokens</span>
                <span className="text-right">Costo</span>
              </div>
              {apps.map((a, i) => (
                <div
                  key={`${a.name}-${a.referer}-${i}`}
                  className={`grid grid-cols-[1fr_5rem_6rem_6rem] items-center gap-3 px-4 py-3 text-sm md:grid-cols-[1fr_1fr_5rem_6rem_6rem] ${
                    i ? "border-t border-zinc-100" : ""
                  }`}
                >
                  <div className="min-w-0 font-semibold text-zinc-900">
                    {a.name}
                  </div>
                  <div className="hidden truncate font-mono text-xs text-zinc-500 md:block">
                    {a.referer ?? "—"}
                  </div>
                  <div className="text-right tabular-nums text-zinc-700">{a.requests}</div>
                  <div className="text-right tabular-nums text-zinc-600">{a.tokens.toLocaleString()}</div>
                  <div className="text-right tabular-nums text-zinc-600">{formatUsd(a.cost)}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </MarketingShell>
  );
}
