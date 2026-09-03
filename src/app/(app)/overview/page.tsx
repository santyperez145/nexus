import Link from "next/link";
import { and, desc, eq, gte } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { formatUsd, microsToUsd } from "@/lib/money";
import { allModels } from "@/lib/catalog";
import { wiredProviders } from "@/lib/providers/registry";
import { Button } from "@/components/ui/button";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { Sparkline } from "@/components/charts/sparkline";
import { RateLimitsCard } from "@/components/dashboard/rate-limits-card";

function relativeTime(d: Date, nowMs: number) {
  const sec = Math.max(1, Math.floor((nowMs - d.getTime()) / 1000));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

async function loadWeekSeries(userId: string) {
  const nowMs = Date.now();
  const since7 = new Date(nowMs - 7 * 24 * 60 * 60 * 1000);
  const week = await db
    .select()
    .from(schema.generations)
    .where(and(eq(schema.generations.userId, userId), gte(schema.generations.createdAt, since7)))
    .orderBy(desc(schema.generations.createdAt))
    .limit(2000);
  const byDay = new Map<string, number>();
  for (let i = 6; i >= 0; i--) {
    byDay.set(new Date(nowMs - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), 0);
  }
  let weekTokens = 0;
  let weekCost = 0;
  let weekErrors = 0;
  const byModel = new Map<string, number>();
  const byProvider = new Map<string, number>();
  for (const r of week) {
    const day = new Date(r.createdAt).toISOString().slice(0, 10);
    if (byDay.has(day)) byDay.set(day, (byDay.get(day) ?? 0) + 1);
    weekTokens += r.promptTokens + r.completionTokens;
    weekCost += microsToUsd(r.costMicros);
    if (r.error) weekErrors += 1;
    byModel.set(r.routedModel, (byModel.get(r.routedModel) ?? 0) + 1);
    byProvider.set(r.provider, (byProvider.get(r.provider) ?? 0) + 1);
  }
  const topModels = [...byModel.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const topProviders = [...byProvider.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  return {
    week,
    spark: [...byDay.values()],
    weekTokens,
    weekCost,
    weekErrors,
    topModels,
    topProviders,
    nowMs,
  };
}

export default async function OverviewPage() {
  const session = await getSession();
  const userId = session!.user.id;
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  const recent = await db
    .select()
    .from(schema.generations)
    .where(eq(schema.generations.userId, userId))
    .orderBy(desc(schema.generations.createdAt))
    .limit(10);
  const { week, spark, weekTokens, weekCost, weekErrors, topModels, topProviders, nowMs } =
    await loadWeekSeries(userId);
  const keys = await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.userId, userId));
  const labs = wiredProviders().length;
  const models = allModels().filter((m) => !m.id.startsWith("nexus/")).length;
  const unusedKeys = keys.filter((k) => !k.lastUsedAt);
  const balanceUsd = microsToUsd(user?.creditMicros ?? 0);
  const balance = formatUsd(balanceUsd, 2);
  const dailyBurn = weekCost / 7;
  const runwayDays =
    dailyBurn > 0.0001 ? Math.floor(balanceUsd / dailyBurn) : week.length === 0 ? null : Infinity;
  const errorRate = week.length ? Math.round((weekErrors / week.length) * 100) : 0;

  return (
    <div>
      <AppPageHeader
        title="Overview"
        actions={
          <>
            <Button asChild size="sm" variant="outline">
              <Link href="/welcome">Welcome</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/studio">Studio</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/chat">Playground</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/settings/credits">Cargar</Link>
            </Button>
          </>
        }
      >
        Saldo, keys y generaciones reales de esta cuenta. El pool de labs depende de Conexiones.
      </AppPageHeader>

      {labs === 0 ? (
        <p className="mb-6 rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-sm text-amber-100">
          No hay labs cableados: el playground responde en eco local.{" "}
          <Link href="/settings/connections" className="text-amber-400 hover:underline">
            Conexiones
          </Link>
          {" · "}
          <Link href="/settings/byok" className="text-amber-400 hover:underline">
            BYOK
          </Link>
        </p>
      ) : null}
      {unusedKeys.length ? (
        <p className="mb-6 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-400">
          Hay {unusedKeys.length} key(s) sin usar.{" "}
          <Link href="/settings/keys?welcome=1" className="text-amber-400 hover:underline">
            Revelar bienvenida
          </Link>
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.9fr)_minmax(0,1.2fr)]">
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Wallet</div>
          <div className="mt-2 font-[family-name:var(--font-syne)] text-4xl font-semibold tracking-tight text-amber-300">
            {balance}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {runwayDays == null
              ? "Sin burn 7d — runway n/d"
              : runwayDays === Infinity
                ? "Burn ~$0 · runway ilimitado a este ritmo"
                : `~${runwayDays}d de runway (burn 7d)`}
          </p>
          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-zinc-600">Keys</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{keys.length}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-zinc-600">Labs</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{labs}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-zinc-600">Models</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{models}</div>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/settings/keys">API keys</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/settings/connections">Conexiones</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/docs">Docs</Link>
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Últimos 7d</div>
            <Link href="/analytics" className="text-[11px] text-amber-400/90 hover:underline">
              Analytics →
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-zinc-600">Requests</div>
              <div className="text-xl font-semibold tabular-nums">{week.length}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-600">Costo</div>
              <div className="text-xl font-semibold tabular-nums">{formatUsd(weekCost)}</div>
            </div>
          </div>
          <p className="mt-1 text-xs text-zinc-600">
            {weekTokens.toLocaleString()} tokens
            {week.length ? ` · ${errorRate}% con error` : ""}
          </p>
          <Sparkline values={spark} className="mt-4 h-12 w-full" />
          {topModels.length ? (
            <div className="mt-4 border-t border-white/10 pt-3">
              <div className="text-[10px] uppercase tracking-wide text-zinc-600">Top modelos</div>
              <ul className="mt-2 space-y-1">
                {topModels.map(([id, n]) => (
                  <li key={id} className="flex justify-between gap-2 font-mono text-[11px] text-zinc-400">
                    <span className="truncate text-amber-400/80">{id}</span>
                    <span className="tabular-nums">{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {topProviders.length ? (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-wide text-zinc-600">Top providers</div>
              <ul className="mt-2 space-y-1">
                {topProviders.map(([id, n]) => (
                  <li key={id} className="flex justify-between gap-2 font-mono text-[11px] text-zinc-400">
                    <span className="truncate">{id}</span>
                    <span className="tabular-nums">{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold text-zinc-100">Reciente</h2>
            <Link href="/activity" className="text-xs text-amber-400/90 hover:underline">
              Ver activity →
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8">
              <p className="text-center text-sm text-zinc-400">Todavía no hay generaciones.</p>
              <ol className="mx-auto mt-4 max-w-md space-y-2 text-sm text-zinc-500">
                <li>
                  1.{" "}
                  <Link href="/settings/keys" className="text-amber-400 hover:underline">
                    Revelá tu API key
                  </Link>{" "}
                  Default
                </li>
                <li>
                  2.{" "}
                  <Link href="/welcome" className="text-amber-400 hover:underline">
                    Ping en Welcome
                  </Link>{" "}
                  o abrí{" "}
                  <Link href="/chat" className="text-amber-400 hover:underline">
                    Chat
                  </Link>
                </li>
                <li>
                  3. Apps:{" "}
                  <code className="text-zinc-400">POST /api/v1/chat/completions</code>
                </li>
              </ol>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button asChild size="sm">
                  <Link href="/chat">Abrir Chat</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/studio">Studio</Link>
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <Link href="/docs">Docs</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/10">
              {recent.map((r, i) => (
                <Link
                  key={r.id}
                  href={`/activity/${r.id}`}
                  className={`grid grid-cols-[1fr_auto] gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-white/[0.03] ${
                    i ? "border-t border-white/5" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate font-mono text-[13px] text-amber-400/85">{r.routedModel}</div>
                    <div className="mt-0.5 truncate text-xs text-zinc-600">
                      {r.provider}
                      {r.metadata && typeof r.metadata === "object" && "modality" in r.metadata
                        ? ` · ${String((r.metadata as { modality?: string }).modality)}`
                        : ""}
                    </div>
                  </div>
                  <div className="text-right text-xs text-zinc-500">
                    <div className="tabular-nums">
                      {r.promptTokens + r.completionTokens} tok · {formatUsd(microsToUsd(r.costMicros))}
                    </div>
                    <div className="mt-0.5 text-zinc-600">{relativeTime(new Date(r.createdAt), nowMs)}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <RateLimitsCard />
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Atajos</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/analytics">Analytics</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/activity">Activity</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/settings/notifications">Notifications</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/enterprise">Enterprise</Link>
            </Button>
          </div>
          <p className="mt-3 text-xs leading-5 text-zinc-600">
            60 rpm por cuenta · free models con RPD según saldo. Keys tienen límite de gasto aparte.
          </p>
        </section>
      </div>
    </div>
  );
}
