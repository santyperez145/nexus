import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { allModels, usdPerMillion } from "@/lib/catalog";
import { db, ensureDb, schema } from "@/lib/db";
import { formatUsd } from "@/lib/money";
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
  const maxTok = Math.max(1, ...ranked.slice(0, 80).map((m) => Number(byUsage.get(m.id)?.tokens ?? 0)));

  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <MarketingPageHeader title="Rankings">
          Tokens reales de esta plataforma; el precio desempata. Top {Math.min(80, ranked.length)} de{" "}
          {ranked.length} modelos — sin tracción inventada.
        </MarketingPageHeader>
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="grid grid-cols-[2.5rem_1fr_7rem_8rem] gap-3 border-b border-zinc-200 bg-zinc-50/80 px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-zinc-500 md:grid-cols-[2.5rem_1fr_8rem_7rem_8rem]">
            <span>#</span>
            <span>Modelo</span>
            <span className="hidden md:block">Prompt / 1M</span>
            <span className="text-right">Tokens</span>
            <span className="text-right">Requests</span>
          </div>
          <ol>
            {ranked.slice(0, 80).map((m, i) => {
              const u = byUsage.get(m.id);
              const tok = Number(u?.tokens ?? 0);
              return (
                <li
                  key={m.id}
                  className={`grid grid-cols-[2.5rem_1fr_7rem_8rem] items-center gap-3 px-4 py-3 md:grid-cols-[2.5rem_1fr_8rem_7rem_8rem] ${
                    i ? "border-t border-zinc-100" : ""
                  } ${i % 2 ? "bg-zinc-50/40" : ""}`}
                >
                  <span className="font-mono text-xs text-zinc-400">{i + 1}</span>
                  <div className="min-w-0">
                    <Link href={`/models/${m.id}`} className="font-mono text-sm text-amber-700 hover:underline">
                      {m.id}
                    </Link>
                    <div className="mt-1.5 h-1 max-w-xs overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className="h-full rounded-full bg-amber-500/50"
                        style={{ width: `${Math.max(tok ? 4 : 0, (tok / maxTok) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="hidden tabular-nums text-sm text-zinc-500 md:block">
                    {formatUsd(usdPerMillion(m.pricing.prompt), 2)}
                  </span>
                  <span className="text-right tabular-nums text-sm text-zinc-600">{tok.toLocaleString()}</span>
                  <span className="text-right tabular-nums text-sm text-zinc-500">
                    {Number(u?.requests ?? 0).toLocaleString()}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </MarketingShell>
  );
}
