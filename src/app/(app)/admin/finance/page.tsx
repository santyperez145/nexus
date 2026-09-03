import { desc, eq, inArray, sql } from "drizzle-orm";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { SUBSCRIPTION_PLANS } from "@/lib/config";
import { db, ensureDb, schema } from "@/lib/db";
import { formatUsd, microsToUsd } from "@/lib/money";

function number(value: unknown) { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }

export default async function AdminFinancePage() {
  await ensureDb();
  const [wallet, purchases, billed, subscriptions, ledger, holds] = await Promise.all([
    db.select({ micros: sql<number>`coalesce(sum(${schema.users.creditMicros}), 0)` }).from(schema.users),
    db.select({ micros: sql<number>`coalesce(sum(${schema.creditLedger.micros}), 0)` }).from(schema.creditLedger).where(sql`${schema.creditLedger.type} = 'purchase' and ${schema.creditLedger.createdAt} >= now() - interval '30 days'`),
    db.select({ micros: sql<number>`coalesce(sum(${schema.generations.costMicros}), 0)` }).from(schema.generations).where(sql`${schema.generations.createdAt} >= now() - interval '30 days'`),
    db.select({ id: schema.subscriptions.id, plan: schema.subscriptions.plan, status: schema.subscriptions.status, quantity: schema.subscriptions.quantity, email: schema.users.email, renewsAt: schema.subscriptions.currentPeriodEnd }).from(schema.subscriptions).innerJoin(schema.users, eq(schema.users.id, schema.subscriptions.userId)).where(inArray(schema.subscriptions.status, ["active", "trialing"])).orderBy(desc(schema.subscriptions.updatedAt)).limit(50),
    db.select({ id: schema.creditLedger.id, type: schema.creditLedger.type, micros: schema.creditLedger.micros, note: schema.creditLedger.note, email: schema.users.email, createdAt: schema.creditLedger.createdAt }).from(schema.creditLedger).innerJoin(schema.users, eq(schema.users.id, schema.creditLedger.userId)).orderBy(desc(schema.creditLedger.createdAt)).limit(40),
    db.select({ id: schema.creditHolds.id, generationId: schema.creditHolds.generationId, reservedMicros: schema.creditHolds.reservedMicros, createdAt: schema.creditHolds.createdAt, email: schema.users.email }).from(schema.creditHolds).innerJoin(schema.users, eq(schema.users.id, schema.creditHolds.userId)).where(eq(schema.creditHolds.status, "open")).orderBy(desc(schema.creditHolds.createdAt)).limit(30),
  ]);
  const mrr = subscriptions.reduce((sum, subscription) => sum + (SUBSCRIPTION_PLANS.find((plan) => plan.id === subscription.plan)?.monthlyUsd ?? 0) * subscription.quantity, 0);
  const cards = [
    { label: "MRR registrado", value: formatUsd(mrr, 2), note: "Contratos locales activos/trial; conciliar contra Stripe" },
    { label: "Créditos vendidos · 30 d", value: formatUsd(microsToUsd(number(purchases[0]?.micros))), note: "Valor nominal acreditado, no caja ni fee" },
    { label: "Consumo facturado · 30 d", value: formatUsd(microsToUsd(number(billed[0]?.micros))), note: "Retail persistido por generación" },
    { label: "Pasivo de wallet", value: formatUsd(microsToUsd(number(wallet[0]?.micros))), note: "Saldo total aún disponible para clientes" },
  ];
  return <div>
    <AppPageHeader title="Finanzas">Ledger operativo y economía comercial sin convertir estimaciones en ingresos conciliados.</AppPageHeader>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card)=><section key={card.label} className="rounded-2xl border border-zinc-200 bg-white p-4"><div className="text-[10px] uppercase tracking-[.12em] text-zinc-500">{card.label}</div><div className="mt-2 text-2xl font-semibold">{card.value}</div><p className="mt-2 text-xs leading-5 text-zinc-500">{card.note}</p></section>)}</div>
    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white"><div className="border-b border-zinc-200 px-4 py-3"><h2 className="font-semibold">Suscripciones activas</h2></div><div className="divide-y divide-zinc-100">{subscriptions.map((s)=><div key={s.id} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 text-sm"><div><div>{s.email}</div><div className="text-xs text-zinc-500">{s.status} · {s.quantity} asiento(s)</div></div><div className="text-right font-medium uppercase">{s.plan}<div className="text-[11px] font-normal text-zinc-500">{s.renewsAt ? new Date(s.renewsAt).toLocaleDateString("es-AR") : "sin fecha"}</div></div></div>)}{!subscriptions.length?<p className="px-4 py-8 text-center text-sm text-zinc-500">Sin suscripciones activas.</p>:null}</div></section>
      <section id="holds" className="overflow-hidden rounded-2xl border border-zinc-200 bg-white"><div className="border-b border-zinc-200 px-4 py-3"><h2 className="font-semibold">Reservas abiertas</h2><p className="mt-1 text-xs text-zinc-500">Deben cerrarse como settle o release; revisá antigüedad anormal.</p></div><div className="divide-y divide-zinc-100">{holds.map((h)=><div key={h.id} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 text-xs"><div><div className="font-mono text-zinc-700">{h.generationId}</div><div className="mt-1 text-zinc-500">{h.email} · {new Date(h.createdAt).toLocaleString("es-AR")}</div></div><div className="font-medium">{formatUsd(microsToUsd(h.reservedMicros))}</div></div>)}{!holds.length?<p className="px-4 py-8 text-center text-sm text-emerald-700">No hay reservas abiertas.</p>:null}</div></section>
    </div>
    <section className="mt-6 overflow-x-auto rounded-2xl border border-zinc-200 bg-white"><div className="border-b border-zinc-200 px-4 py-3"><h2 className="font-semibold">Últimos movimientos de ledger</h2></div><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-zinc-50 uppercase tracking-wide text-zinc-500"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Usuario</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Importe</th><th className="px-4 py-3">Nota</th></tr></thead><tbody>{ledger.map((row)=><tr key={row.id} className="border-t border-zinc-100"><td className="px-4 py-3 text-zinc-500">{new Date(row.createdAt).toLocaleString("es-AR")}</td><td className="px-4 py-3">{row.email}</td><td className="px-4 py-3 font-mono">{row.type}</td><td className={`px-4 py-3 font-mono ${row.micros < 0 ? "text-amber-700" : "text-emerald-700"}`}>{row.micros < 0 ? "−" : "+"}{formatUsd(microsToUsd(Math.abs(row.micros)))}</td><td className="max-w-xs truncate px-4 py-3 text-zinc-500">{row.note ?? "—"}</td></tr>)}</tbody></table></section>
  </div>;
}
