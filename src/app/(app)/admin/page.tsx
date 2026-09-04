import Link from "next/link";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { Button } from "@/components/ui/button";
import { registeredMrrUsd, walletLiabilityMicros } from "@/lib/admin/finance";
import { connectionStatus } from "@/lib/connections";
import { db, ensureDb, schema } from "@/lib/db";
import { formatUsd, microsToUsd } from "@/lib/money";
import { isRecentHealthy } from "@/lib/providers/probe";
import { readProviderHealthRows } from "@/lib/providers/health-store";

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default async function AdminOverviewPage() {
  await ensureDb();
  const [userTotals, generationTotals, subscriptions, activeKeys, orgs, workspaces, staleHolds, openHolds, health] =
    await Promise.all([
      db
        .select({ count: count(), walletMicros: sql<number>`coalesce(sum(${schema.users.creditMicros}), 0)` })
        .from(schema.users),
      db
        .select({
          count: count(),
          billedMicros: sql<number>`coalesce(sum(${schema.generations.costMicros}), 0)`,
          errors: sql<number>`count(*) filter (where ${schema.generations.error} is not null)`,
          tokens: sql<number>`coalesce(sum(${schema.generations.promptTokens} + ${schema.generations.completionTokens}), 0)`,
        })
        .from(schema.generations)
        .where(sql`${schema.generations.createdAt} >= now() - interval '24 hours'`),
      db
        .select({
          plan: schema.subscriptions.plan,
          status: schema.subscriptions.status,
          quantity: sql<number>`coalesce(sum(${schema.subscriptions.quantity}), 0)`,
          contracts: sql<number>`count(*)`,
        })
        .from(schema.subscriptions)
        .where(inArray(schema.subscriptions.status, ["active", "trialing"]))
        .groupBy(schema.subscriptions.plan, schema.subscriptions.status),
      db.select({ count: count() }).from(schema.apiKeys).where(eq(schema.apiKeys.disabled, false)),
      db.select({ count: count() }).from(schema.organizations),
      db.select({ count: count() }).from(schema.workspaces),
      db
        .select({ count: count(), micros: sql<number>`coalesce(sum(${schema.creditHolds.reservedMicros}), 0)` })
        .from(schema.creditHolds)
        .where(
          and(
            eq(schema.creditHolds.status, "open"),
            sql`${schema.creditHolds.createdAt} <= now() - interval '15 minutes'`,
          ),
        ),
      db
        .select({ micros: sql<number>`coalesce(sum(${schema.creditHolds.reservedMicros}), 0)` })
        .from(schema.creditHolds)
        .where(eq(schema.creditHolds.status, "open")),
      readProviderHealthRows(),
    ]);

  const connections = connectionStatus();
  const configuredProviderIds = new Set(
    connections.providers.filter((provider) => provider.wired).map((provider) => provider.id),
  );
  const configured = configuredProviderIds.size;
  const healthy = health.filter(
    (row) => configuredProviderIds.has(row.provider) && isRecentHealthy(row),
  ).length;
  const requests = number(generationTotals[0]?.count);
  const errors = number(generationTotals[0]?.errors);
  const mrr = registeredMrrUsd(
    subscriptions.map((subscription) => ({
      ...subscription,
      quantity: number(subscription.quantity),
    })),
  );
  const subscriptionCount = subscriptions.reduce(
    (sum, subscription) => sum + number(subscription.contracts),
    0,
  );
  const walletMicros = walletLiabilityMicros(
    number(userTotals[0]?.walletMicros),
    number(openHolds[0]?.micros),
  );

  const cards = [
    { label: "Usuarios", value: number(userTotals[0]?.count).toLocaleString(), note: `${subscriptionCount} suscripciones activas o trial` },
    { label: "MRR registrado", value: formatUsd(mrr, 2), note: "Sólo suscripciones locales activas; no es caja conciliada" },
    { label: "Pasivo de wallet", value: formatUsd(microsToUsd(walletMicros)), note: "Crédito disponible más reservas abiertas comprometidas con clientes" },
    { label: "Solicitudes · 24 h", value: requests.toLocaleString(), note: `${number(generationTotals[0]?.tokens).toLocaleString()} tokens · ${requests ? ((errors / requests) * 100).toFixed(1) : "0.0"}% error` },
    { label: "Consumo facturado · 24 h", value: formatUsd(microsToUsd(number(generationTotals[0]?.billedMicros))), note: "Importe retail persistido en generaciones" },
    { label: "Proveedores operativos", value: `${healthy}/${configured}`, note: `${configured}/${connections.providers.length} configurados; salud válida por 30 min` },
  ];

  return (
    <div>
      <AppPageHeader
        title="Superadmin"
        actions={
          <Button asChild size="sm">
            <Link href="/admin/operations">Operar plataforma</Link>
          </Button>
        }
      >
        Vista ejecutiva con señales reales de producto, finanzas y operación. Los importes se etiquetan según su fuente para no confundir saldo, facturación y caja.
      </AppPageHeader>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <section key={card.label} className="rounded-2xl border border-zinc-200 bg-white p-5">
            <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">{card.label}</div>
            <div className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">{card.value}</div>
            <p className="mt-2 text-xs leading-5 text-zinc-500">{card.note}</p>
          </section>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="font-semibold text-zinc-950">Riesgos que requieren atención</h2>
          <div className="mt-4 grid gap-3 text-sm">
            <Link href="/admin/finance#holds" className="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-3 hover:border-violet-300">
              <span>Reservas abiertas por más de 15 minutos</span>
              <span className={number(staleHolds[0]?.count) ? "font-semibold text-amber-700" : "text-emerald-700"}>
                {number(staleHolds[0]?.count)} · {formatUsd(microsToUsd(number(staleHolds[0]?.micros)))}
              </span>
            </Link>
            <Link href="/admin/operations" className="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-3 hover:border-violet-300">
              <span>Proveedores configurados sin salud reciente</span>
              <span className={configured - healthy > 0 ? "font-semibold text-amber-700" : "text-emerald-700"}>
                {Math.max(0, configured - healthy)}
              </span>
            </Link>
          </div>
        </section>
        <section className="rounded-2xl border border-zinc-200 bg-zinc-950 p-5 text-white">
          <h2 className="font-semibold">Escala instalada</h2>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div><div className="text-2xl font-semibold">{number(activeKeys[0]?.count)}</div><div className="mt-1 text-xs text-zinc-400">Claves activas</div></div>
            <div><div className="text-2xl font-semibold">{number(orgs[0]?.count)}</div><div className="mt-1 text-xs text-zinc-400">Organizaciones</div></div>
            <div><div className="text-2xl font-semibold">{number(workspaces[0]?.count)}</div><div className="mt-1 text-xs text-zinc-400">Workspaces</div></div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            <Link href="/admin/users" className="rounded-lg bg-white px-3 py-2 text-zinc-950">Gestionar usuarios</Link>
            <Link href="/admin/finance" className="rounded-lg border border-zinc-700 px-3 py-2 text-zinc-200">Revisar economía</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
