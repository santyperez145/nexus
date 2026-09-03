import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { RECIPES } from "@/lib/apps/recipes";
import { db, ensureDb, schema } from "@/lib/db";
import { formatUsd, microsToUsd } from "@/lib/money";
import { wiredProviders } from "@/lib/providers/registry";

export const dynamic = "force-dynamic";

export default async function AppsPage() {
  await ensureDb();
  const wired = wiredProviders().length;
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
          className="pointer-events-none absolute inset-x-0 -top-6 h-40 bg-[radial-gradient(ellipse_at_top,_rgba(217,119,6,0.1),_transparent_70%)]"
        />
        <MarketingPageHeader title="Apps">
          Recipes curados + ranking real por{" "}
          <code className="text-zinc-700">HTTP-Referer</code> /{" "}
          <code className="text-zinc-700">X-Title</code>. Sin directorio inventado — solo lo que
          pegó a esta instancia.
        </MarketingPageHeader>

        <div className="mb-10 grid gap-3 sm:grid-cols-3">
          {[
            { k: "Recipes", v: String(RECIPES.length) },
            { k: "Apps atribuidas", v: String(apps.length) },
            { k: "Req atribuidos", v: totalReq.toLocaleString() },
          ].map((s) => (
            <div key={s.k} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">{s.k}</div>
              <div className="mt-1 font-[family-name:var(--font-syne)] text-2xl font-semibold text-zinc-900">
                {s.v}
              </div>
            </div>
          ))}
        </div>

        <p className="mb-8 text-sm text-zinc-500">
          Gateway mode: {wired ? `${wired} labs live` : "local echo"}. Guest puede probar recipes
          vía{" "}
          <Link href="/chat" className="text-amber-700 hover:underline">
            /chat
          </Link>{" "}
          sin key (eco).
        </p>

        <section className="mb-12">
          <h2 className="mb-4 font-[family-name:var(--font-syne)] text-lg font-semibold text-zinc-900">
            Recipes
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {RECIPES.map((r) => (
              <Link
                key={r.slug}
                href={`/apps/${r.slug}`}
                className="group rounded-xl border border-zinc-200 bg-white px-4 py-4 transition-colors hover:border-amber-600/40"
              >
                <div className="font-[family-name:var(--font-syne)] font-semibold text-zinc-900 group-hover:text-amber-900">
                  {r.title}
                </div>
                <p className="mt-1 text-sm text-zinc-500">{r.blurb}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {r.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded border border-zinc-100 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <div className="mt-3 font-mono text-[11px] text-zinc-400">{r.model}</div>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-4 font-[family-name:var(--font-syne)] text-lg font-semibold text-zinc-900">
            Live attribution
          </h2>
          {!apps.length ? (
            <div className="rounded-xl border border-dashed border-zinc-200 bg-white px-4 py-12 text-center text-sm text-zinc-500">
              Todavía no hay atribución. Desde el SDK o curl mandá headers y van a aparecer acá.
              <pre className="mx-auto mt-4 max-w-md overflow-x-auto rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-left font-mono text-[11px] text-zinc-600">
{`-H "HTTP-Referer: https://tu-app.example"
-H "X-Title: Mi App"`}
              </pre>
              <div className="mt-4">
                <Link href="/docs" className="text-amber-700 hover:underline">
                  Docs →
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
                  <div className="min-w-0 font-[family-name:var(--font-syne)] font-semibold text-zinc-900">
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
