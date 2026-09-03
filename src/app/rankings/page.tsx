import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
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
    <div className="min-h-screen bg-zinc-950">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="mb-2 text-3xl font-semibold">Rankings</h1>
        <p className="mb-8 text-zinc-500">
          Tokens reales de esta plataforma; el precio desempata. {ranked.length} modelos en
          catálogo.
        </p>
        <ol className="grid gap-4">
          {ranked.slice(0, 80).map((m, i) => {
            const u = byUsage.get(m.id);
            return (
              <li key={m.id} className="flex items-baseline justify-between gap-4 border-t border-white/10 pt-3">
                <span className="w-8 text-zinc-500">{i + 1}</span>
                <span className="flex-1 font-mono text-sm">
                  <Link href={`/models/${m.id}`} className="hover:text-amber-400">
                    {m.id}
                  </Link>
                </span>
                <span className="text-sm text-zinc-400">
                  {Number(u?.tokens ?? 0).toLocaleString()} tok · {Number(u?.requests ?? 0)} req
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <SiteFooter />
    </div>
  );
}
