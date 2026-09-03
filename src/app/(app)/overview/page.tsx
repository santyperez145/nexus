import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { formatUsd, microsToUsd } from "@/lib/money";
import { allModels } from "@/lib/catalog";
import { wiredProviders } from "@/lib/providers/registry";
import { Button } from "@/components/ui/button";
import { AppPageHeader } from "@/components/layout/app-page-header";

function relativeTime(d: Date) {
  const sec = Math.max(1, Math.floor((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
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
  const keys = await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.userId, userId));
  const labs = wiredProviders().length;
  const models = allModels().filter((m) => !m.id.startsWith("nexus/")).length;
  const unusedKeys = keys.filter((k) => !k.lastUsedAt);
  const balance = formatUsd(microsToUsd(user?.creditMicros ?? 0), 2);

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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.2fr)]">
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Wallet</div>
          <div className="mt-2 font-[family-name:var(--font-syne)] text-4xl font-semibold tracking-tight text-amber-300">
            {balance}
          </div>
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

        <section>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold text-zinc-100">Reciente</h2>
            <Link href="/activity" className="text-xs text-amber-400/90 hover:underline">
              Ver activity →
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-zinc-500">
              Todavía no hay generaciones. Abrí el playground o pegale a{" "}
              <code className="text-zinc-400">/api/v1/chat/completions</code>.
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
                    <div className="mt-0.5 text-zinc-600">{relativeTime(new Date(r.createdAt))}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
