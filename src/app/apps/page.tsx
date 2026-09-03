import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { db, ensureDb, schema } from "@/lib/db";
import { formatUsd, microsToUsd } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function AppsPage() {
  await ensureDb();
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

  return (
    <MarketingShell>
      <div className="mx-auto max-w-5xl px-4 py-12 md:py-16">
        <MarketingPageHeader title="Apps">
          Clientes que mandan <code className="text-zinc-700">HTTP-Referer</code> /{" "}
          <code className="text-zinc-700">X-Title</code>. Ranking por requests reales de esta
          instancia — sin directorio inventado.
        </MarketingPageHeader>

        {!apps.length ? (
          <div className="rounded-xl border border-dashed border-zinc-200 bg-white px-4 py-12 text-center text-sm text-zinc-500">
            Todavía no hay atribución. Desde el SDK o curl mandá headers y van a aparecer acá.
            <div className="mt-4">
              <Link href="/docs" className="text-amber-700 hover:underline">
                Docs de atribución →
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
      </div>
    </MarketingShell>
  );
}
