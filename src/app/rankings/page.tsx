import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { allModels, usdPerMillion } from "@/lib/catalog";
import { db, ensureDb, schema } from "@/lib/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function RankingsPage() {
  await ensureDb();
  const usage = await db
    .select({
      model: schema.generations.routedModel,
      tokens: sql<number>`sum(${schema.generations.promptTokens} + ${schema.generations.completionTokens})`,
      requests: sql<number>`count(*)`,
    })
    .from(schema.generations)
    .groupBy(schema.generations.routedModel);

  const byUsage = new Map(usage.map((u) => [u.model, u]));
  const ranked = allModels()
    .filter((m) => !m.id.startsWith("nexus/"))
    .slice()
    .sort((a, b) => {
      const ta = Number(byUsage.get(a.id)?.tokens ?? 0);
      const tb = Number(byUsage.get(b.id)?.tokens ?? 0);
      if (tb !== ta) return tb - ta;
      return usdPerMillion(a.pricing.prompt) - usdPerMillion(b.pricing.prompt);
    });

  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <MarketingPageHeader title="Rankings">
          Tokens reales de esta plataforma; el precio desempata. {ranked.length} modelos en
          catálogo.
        </MarketingPageHeader>
        <ol className="grid gap-0">
          {ranked.slice(0, 80).map((m, i) => {
            const u = byUsage.get(m.id);
            return (
              <li
                key={m.id}
                className="flex items-baseline justify-between gap-4 border-t border-zinc-200 py-3"
              >
                <span className="w-8 font-mono text-xs text-zinc-400">{i + 1}</span>
                <span className="flex-1 font-mono text-sm">
                  <Link href={`/models/${m.id}`} className="text-amber-700 hover:underline">
                    {m.id}
                  </Link>
                </span>
                <span className="text-sm text-zinc-500">
                  {Number(u?.tokens ?? 0).toLocaleString()} tok · {Number(u?.requests ?? 0)} req
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </MarketingShell>
  );
}
