import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { formatUsd, microsToUsd } from "@/lib/money";
import { allModels } from "@/lib/catalog";
import { wiredProviders } from "@/lib/providers/registry";
import { Button } from "@/components/ui/button";

export default async function OverviewPage() {
  const session = await getSession();
  const userId = session!.user.id;
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  const recent = await db
    .select()
    .from(schema.generations)
    .where(eq(schema.generations.userId, userId))
    .orderBy(desc(schema.generations.createdAt))
    .limit(8);
  const keys = await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.userId, userId));
  const labs = wiredProviders().length;
  const models = allModels().filter((m) => !m.id.startsWith("nexus/")).length;
  const unusedKeys = keys.filter((k) => !k.lastUsedAt);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Overview</h1>
      <p className="mb-8 text-sm text-zinc-500">
        Saldo, keys y las últimas generaciones. El pool de labs depende de las keys en Conexiones.
      </p>
      {labs === 0 ? (
        <p className="mb-6 rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-sm text-amber-100">
          No hay labs cableados: el playground responde en eco local.{" "}
          <Link href="/settings/connections" className="text-amber-400 hover:underline">
            Conexiones
          </Link>
        </p>
      ) : null}
      {unusedKeys.length ? (
        <p className="mb-6 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-400">
          Hay {unusedKeys.length} key(s) que nunca se usaron. La de bienvenida no se muestra: rotála en{" "}
          <Link href="/settings/keys" className="text-amber-400 hover:underline">
            API Keys
          </Link>
          .
        </p>
      ) : null}
      <div className="mb-10 grid gap-6 md:grid-cols-4">
        <div>
          <div className="text-xs text-zinc-500">Saldo</div>
          <div className="text-2xl font-semibold text-amber-400">
            {formatUsd(microsToUsd(user?.creditMicros ?? 0), 2)}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">API keys</div>
          <div className="text-2xl font-semibold">{keys.length}</div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">Labs cableados</div>
          <div className="text-2xl font-semibold">{labs}</div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">Modelos en catálogo</div>
          <div className="text-2xl font-semibold">{models}</div>
        </div>
      </div>
      <div className="mb-8 flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/chat">Abrir playground</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/settings/credits">Cargar créditos</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/settings/keys">API keys</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/settings/connections">Conexiones</Link>
        </Button>
      </div>
      <h2 className="mb-3 text-lg font-medium">Reciente</h2>
      {recent.length === 0 ? (
        <p className="text-sm text-zinc-500">Todavía no hay generaciones.</p>
      ) : (
        <div className="grid gap-2">
          {recent.map((r) => (
            <Link
              key={r.id}
              href={`/activity/${r.id}`}
              className="flex flex-wrap justify-between gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm hover:border-amber-400/40"
            >
              <span className="font-mono text-amber-400/80">{r.routedModel}</span>
              <span className="text-zinc-500">
                {r.promptTokens + r.completionTokens} tok · {formatUsd(microsToUsd(r.costMicros))} ·{" "}
                {r.provider}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
