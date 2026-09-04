import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { CreditAdjustmentForm } from "@/components/admin/credit-adjustment-form";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { db, ensureDb, schema } from "@/lib/db";
import { formatUsd, microsToUsd } from "@/lib/money";

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await ensureDb();
  const { id } = await params;
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!user) notFound();
  const [keys, generations, ledger] = await Promise.all([
    db.select().from(schema.apiKeys).where(eq(schema.apiKeys.userId, id)).orderBy(desc(schema.apiKeys.createdAt)).limit(20),
    db.select().from(schema.generations).where(eq(schema.generations.userId, id)).orderBy(desc(schema.generations.createdAt)).limit(20),
    db.select().from(schema.creditLedger).where(eq(schema.creditLedger.userId, id)).orderBy(desc(schema.creditLedger.createdAt)).limit(30),
  ]);
  return <div>
    <Link href="/admin/users" className="mb-4 inline-block text-sm text-zinc-500 hover:text-zinc-950">← Usuarios</Link>
    <AppPageHeader title={user.name}><span className="break-all">{user.email} · <span className="font-mono text-xs">{user.id}</span></span></AppPageHeader>
    <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[{label:"Saldo",value:formatUsd(microsToUsd(user.creditMicros))},{label:"Plan",value:user.plan.toUpperCase()},{label:"Suscripción",value:user.subscriptionStatus},{label:"Claves",value:String(keys.length)}].map((item)=><section key={item.label} className="rounded-2xl border border-zinc-200 bg-white p-4"><div className="text-[10px] uppercase tracking-[.12em] text-zinc-500">{item.label}</div><div className="mt-2 text-xl font-semibold">{item.value}</div></section>)}
    </div>
    <CreditAdjustmentForm userId={user.id} />
    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white"><div className="border-b border-zinc-200 px-4 py-3"><h2 className="font-semibold">Actividad reciente</h2></div><div className="divide-y divide-zinc-100">{generations.map((generation)=><div key={generation.id} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 text-xs"><div><div className="font-mono text-violet-700">{generation.routedModel}</div><div className="mt-1 text-zinc-500">{generation.provider} · {generation.error ? "error" : generation.finishReason ?? "completada"}</div></div><div className="text-right"><div>{formatUsd(microsToUsd(generation.costMicros))}</div><div className="mt-1 text-zinc-500">{new Date(generation.createdAt).toLocaleString("es-AR")}</div></div></div>)}{!generations.length?<p className="px-4 py-8 text-center text-sm text-zinc-500">Sin generaciones.</p>:null}</div></section>
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white"><div className="border-b border-zinc-200 px-4 py-3"><h2 className="font-semibold">Ledger reciente</h2></div><div className="divide-y divide-zinc-100">{ledger.map((entry)=><div key={entry.id} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 text-xs"><div><div className="font-mono">{entry.type}</div><div className="mt-1 max-w-md truncate text-zinc-500">{entry.note ?? "—"}</div></div><div className={`text-right ${entry.micros < 0 ? "text-amber-700" : "text-emerald-700"}`}><div>{entry.micros < 0 ? "−" : "+"}{formatUsd(microsToUsd(Math.abs(entry.micros)))}</div><div className="mt-1 text-zinc-500">{new Date(entry.createdAt).toLocaleString("es-AR")}</div></div></div>)}{!ledger.length?<p className="px-4 py-8 text-center text-sm text-zinc-500">Sin movimientos.</p>:null}</div></section>
    </div>
  </div>;
}
