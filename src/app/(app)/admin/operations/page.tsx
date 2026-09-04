import { count, desc, eq } from "drizzle-orm";
import { OperationsActions } from "@/components/admin/operations-actions";
import { ModelGovernanceQueue } from "@/components/admin/model-governance-queue";
import { StripeEventReplayButton } from "@/components/admin/stripe-event-replay-button";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { connectionStatus } from "@/lib/connections";
import { db, ensureDb, schema } from "@/lib/db";
import { commercialLaunchReady, readinessSnapshot } from "@/lib/health/readiness";
import { listPendingModelGovernance } from "@/lib/hub/model-governance";
import { readProviderHealthRows } from "@/lib/providers/health-store";
import { isRecentHealthy } from "@/lib/providers/probe";

export default async function AdminOperationsPage() {
  await ensureDb();
  const status = connectionStatus();
  const [
    readiness,
    health,
    snapshots,
    pendingWebhooks,
    failedWebhooks,
    stripeProcessing,
    stripeFailed,
    stripeEvents,
    governance,
  ] = await Promise.all([
    readinessSnapshot(),
    readProviderHealthRows(),
    db.select().from(schema.catalogSnapshots).orderBy(desc(schema.catalogSnapshots.fetchedAt)).limit(8),
    db.select({ count: count() }).from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.status, "pending")),
    db.select({ count: count() }).from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.status, "failed")),
    db.select({ count: count() }).from(schema.stripeWebhookEvents).where(eq(schema.stripeWebhookEvents.status, "processing")),
    db.select({ count: count() }).from(schema.stripeWebhookEvents).where(eq(schema.stripeWebhookEvents.status, "failed")),
    db.select().from(schema.stripeWebhookEvents).orderBy(desc(schema.stripeWebhookEvents.receivedAt)).limit(8),
    listPendingModelGovernance(),
  ]);
  const healthByProvider = new Map(health.map((row) => [row.provider, row]));
  const infrastructure = [status.database, status.auth, status.stripe, status.redis, status.objectStorage];
  const runtimeChecks = Object.entries(readiness.checks);
  const launchReady = commercialLaunchReady(readiness);
  return <div>
    <AppPageHeader title="Operaciones" actions={<OperationsActions />}>Configuración, salud observada y tareas operatorias. “Configurado” sólo confirma el entorno; “operativo” exige una sonda reciente exitosa.</AppPageHeader>
    <section className={`mb-4 rounded-2xl border p-4 ${launchReady ? "border-emerald-200 bg-emerald-50/70" : "border-amber-200 bg-amber-50/70"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-zinc-950">Disponibilidad comercial</h2>
          <p className="mt-1 text-xs text-zinc-600">
            Exige proceso sano, inferencia configurada y cobros conectados. No equivale a conciliación financiera ni a un SLA externo.
          </p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${launchReady ? "border-emerald-300 text-emerald-800" : "border-amber-300 text-amber-900"}`}>
          {launchReady ? "Lista para clientes" : "Bloqueada para clientes"}
        </span>
      </div>
    </section>
    <section className={`mb-6 rounded-2xl border p-4 ${readiness.ok ? "border-emerald-200 bg-emerald-50/70" : "border-rose-200 bg-rose-50/70"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-zinc-950">Readiness del control plane</h2>
          <p className="mt-1 text-xs text-zinc-600">Prueba viva de configuración, Postgres y Redis. Railway usa liveness; el ingreso comercial usa el gate de readiness.</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${readiness.ok ? "border-emerald-300 text-emerald-800" : "border-rose-300 text-rose-800"}`}>{readiness.ok ? "Control plane sano" : "Control plane no listo"}</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {runtimeChecks.map(([name, check]) => <div key={name} className="rounded-xl border border-white/80 bg-white/80 px-3 py-2 text-xs"><div className="flex items-center justify-between gap-2"><span className="capitalize text-zinc-700">{name}</span><span className={check.ok ? "text-emerald-700" : "text-rose-700"}>{check.ok ? "OK" : "Falla"}</span></div><div className="mt-1 text-[10px] text-zinc-500">{check.latencyMs} ms{check.detail ? ` · ${check.detail}` : ""}</div></div>)}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-zinc-600">
        <span className="rounded-full border border-zinc-200 bg-white px-2 py-1">Inferencia configurada: {readiness.capabilities.inferenceConfigured ? "sí" : "no"}</span>
        <span className="rounded-full border border-zinc-200 bg-white px-2 py-1">Inferencia operativa: {readiness.capabilities.inferenceOperational ? "sí" : "no"}</span>
        <span className="rounded-full border border-zinc-200 bg-white px-2 py-1">Comercio configurado: {readiness.capabilities.commerceConfigured ? "sí" : "no"}</span>
        <span className="rounded-full border border-zinc-200 bg-white px-2 py-1">Comercio operativo: {readiness.capabilities.commerceOperational ? "sí" : "no"}</span>
        <span className="rounded-full border border-zinc-200 bg-white px-2 py-1">Artefactos S3: {readiness.capabilities.artifactStorageConfigured ? "sí" : "no"}</span>
      </div>
    </section>
    <ModelGovernanceQueue
      evaluations={governance.evaluations.map((row) => ({
        ...row,
        created_at: new Date(row.created_at).toISOString(),
      }))}
      promotions={governance.promotions.map((row) => ({
        ...row,
        created_at: new Date(row.created_at).toISOString(),
      }))}
    />
    <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{infrastructure.map((item)=><section key={item.id} className="rounded-2xl border border-zinc-200 bg-white p-4"><div className="flex items-center justify-between gap-2"><div className="font-medium">{item.label}</div><span className={`size-2.5 rounded-full ${item.wired ? "bg-emerald-500" : "bg-zinc-300"}`} /></div><p className="mt-2 text-xs leading-5 text-zinc-500">{item.hint}</p></section>)}</div>
    <div className="grid gap-6 xl:grid-cols-[1.4fr_.8fr]">
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white"><div className="border-b border-zinc-200 px-4 py-3"><h2 className="font-semibold">Proveedores</h2></div><div className="grid md:grid-cols-2">{status.providers.map((provider)=>{const row=healthByProvider.get(provider.id);const operational=Boolean(row&&isRecentHealthy(row));return <div key={provider.id} className="flex items-start justify-between gap-3 border-b border-zinc-100 px-4 py-3 md:odd:border-r"><div><div className="text-sm font-medium">{provider.label}</div><div className="mt-1 font-mono text-[10px] text-zinc-400">{provider.env}</div></div><div className="text-right text-xs"><div className={operational?"text-emerald-700":provider.wired?"text-amber-700":"text-zinc-400"}>{operational?"Operativo":provider.wired?"Sin salud reciente":"Sin configurar"}</div><div className="mt-1 text-[10px] text-zinc-400">{row ? `${row.latencyMs ?? "—"} ms · ${new Date(row.lastCheck).toLocaleString("es-AR")}` : "Nunca verificado"}</div></div></div>})}</div></section>
      <div className="grid content-start gap-4">
        <section className="rounded-2xl border border-zinc-200 bg-white p-4"><h2 className="font-semibold">Entregas de observabilidad</h2><div className="mt-4 grid grid-cols-2 gap-3"><div><div className="text-2xl font-semibold">{Number(pendingWebhooks[0]?.count ?? 0)}</div><div className="text-xs text-zinc-500">Pendientes/reintento</div></div><div><div className="text-2xl font-semibold">{Number(failedWebhooks[0]?.count ?? 0)}</div><div className="text-xs text-zinc-500">Terminales</div></div></div></section>
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Webhooks de Stripe</h2>
              <span className="text-[11px] text-zinc-500">
                {Number(stripeProcessing[0]?.count ?? 0)} procesando · {Number(stripeFailed[0]?.count ?? 0)} fallidos
              </span>
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">Inbox idempotente. Un evento fallido se recupera desde Stripe y vuelve a pasar por el procesador canónico.</p>
          </div>
          <div className="divide-y divide-zinc-100">
            {stripeEvents.map((event) => (
              <div key={event.id} className="px-4 py-3 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate font-mono text-[10px] text-zinc-600">{event.eventType}</span>
                  <span className={event.status === "processed" ? "text-emerald-700" : event.status === "failed" ? "text-rose-700" : "text-amber-700"}>
                    {event.status} · {event.attempts}x
                  </span>
                </div>
                <div className="mt-1 truncate font-mono text-[10px] text-zinc-400">{event.id}</div>
                {event.lastError ? <p className="mt-1 line-clamp-2 text-[10px] text-rose-700">{event.lastError}</p> : null}
                <div className="mt-1 text-[10px] text-zinc-400">
                  Último intento {new Date(event.lastAttemptAt).toLocaleString("es-AR")}
                </div>
                {event.status === "failed" ? <StripeEventReplayButton eventId={event.id} /> : null}
              </div>
            ))}
            {!stripeEvents.length ? <p className="px-4 py-8 text-center text-sm text-zinc-500">Sin eventos recibidos.</p> : null}
          </div>
        </section>
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white"><div className="border-b border-zinc-200 px-4 py-3"><h2 className="font-semibold">Snapshots de catálogo</h2></div><div className="divide-y divide-zinc-100">{snapshots.map((snapshot)=><div key={snapshot.id} className="flex justify-between gap-3 px-4 py-3 text-xs"><div><div className="font-medium">{snapshot.source}</div><div className="mt-1 text-zinc-500">{new Date(snapshot.fetchedAt).toLocaleString("es-AR")}</div></div><div>{snapshot.modelCount.toLocaleString()} modelos</div></div>)}{!snapshots.length?<p className="px-4 py-8 text-center text-sm text-zinc-500">Sin sincronizaciones persistidas.</p>:null}</div></section>
      </div>
    </div>
  </div>;
}
