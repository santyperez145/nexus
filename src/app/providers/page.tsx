import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { isExecutableEndpoint } from "@/lib/catalog";
import { allRuntimeModels } from "@/lib/catalog/runtime";
import { providerSnapshot } from "@/lib/gateway/health";
import { NEXUS_PROVIDERS, wiredProviders } from "@/lib/providers/registry";
import { isProviderZdrConfirmed } from "@/lib/providers/privacy";
import { recentOperationalProviderIds } from "@/lib/providers/health-store";
import { listPublicManagedProviders } from "@/lib/providers/onboarding";

export const dynamic = "force-dynamic";

export default async function ProvidersPage() {
  const live = new Set(wiredProviders().map((p) => p.id));
  let operational = new Set<string>();
  let managed: Awaited<ReturnType<typeof listPublicManagedProviders>> = [];
  try {
    [operational, managed] = await Promise.all([
      recentOperationalProviderIds(),
      listPublicManagedProviders(),
    ]);
  } catch {
    operational = new Set();
    managed = [];
  }
  const runtimeModels = await allRuntimeModels();
  const providers = [
    ...NEXUS_PROVIDERS.map((provider) => ({
      id: provider.id,
      label: provider.label,
      kind: provider.kind,
      wired: live.has(provider.id),
      operational: operational.has(provider.id),
      zdr: isProviderZdrConfirmed(provider.id),
      zdrCapable: Boolean(provider.zdr),
      managed: false,
    })),
    ...managed.map((provider) => ({
      id: provider.id,
      label: provider.label,
      kind: provider.kind,
      wired: true,
      operational: provider.operational,
      zdr: provider.zdr,
      zdrCapable: provider.zdrCapable,
      managed: true,
    })),
  ];
  const wired = providers.filter((provider) => provider.wired).length;
  const counts = new Map<string, number>();
  const executableCounts = new Map<string, number>();
  for (const m of runtimeModels) {
    for (const e of m.endpoints) {
      counts.set(e.adapter, (counts.get(e.adapter) ?? 0) + 1);
      if (isExecutableEndpoint(e)) {
        executableCounts.set(e.adapter, (executableCounts.get(e.adapter) ?? 0) + 1);
      }
    }
  }
  let circuits: Array<{ name: string; circuit: string; failures: number }> = [];
  try {
    circuits = await providerSnapshot();
  } catch {
    circuits = [];
  }
  const circuitBy = new Map(circuits.map((c) => [c.name, c]));
  const modelCount = runtimeModels.filter((model) => !model.id.startsWith("nexus/")).length;

  return (
    <MarketingShell>
      <div className="relative mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-8 h-64 bg-[radial-gradient(circle_at_25%_0%,rgba(99,102,241,0.14),transparent_48%),radial-gradient(circle_at_75%_0%,rgba(6,182,212,0.1),transparent_42%)]"
        />
        <MarketingPageHeader title="Proveedores">
          Compará el catálogo disponible en cada proveedor y elegí cómo ejecutar tus modelos desde
          una sola cuenta.
        </MarketingPageHeader>

        <div className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { k: "Proveedores compatibles", v: String(providers.length) },
            { k: "Modelos en catálogo", v: modelCount.toLocaleString() },
            { k: "Configurados", v: String(wired) },
            { k: "Verificados ahora", v: String(operational.size) },
          ].map((s) => (
            <div key={s.k} className="nexus-surface rounded-2xl border border-indigo-100 bg-white/90 px-4 py-4">
              <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-500">{s.k}</div>
              <div className="mt-1 font-[family-name:var(--font-syne)] text-2xl font-semibold text-[#111326]">
                {s.v}
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {providers.map((p) => {
            const on = p.wired;
            const n = counts.get(p.id) ?? 0;
            const executable = executableCounts.get(p.id) ?? 0;
            const cb = circuitBy.get(p.id);
            const circuit = cb?.circuit ?? "closed";
            const zdr = p.zdr;
            const verified = p.operational;
            return (
              <Link
                key={p.id}
                href={`/providers/${p.id}`}
                className="nexus-surface group rounded-2xl border border-indigo-100 bg-white/90 p-4 transition-all hover:-translate-y-0.5 hover:border-indigo-300"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-lg font-semibold text-zinc-950 group-hover:text-zinc-950">
                      {p.label}
                    </div>
                    <div className="mt-1 truncate font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-400">
                      {p.kind === "anthropic"
                        ? "Anthropic Messages"
                        : p.kind === "google"
                          ? "Google Gemini"
                          : p.kind === "mistral"
                        ? "Mistral native"
                            : "OpenAI-compatible"}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                      verified
                        ? "border-emerald-600/30 bg-emerald-50 text-emerald-800"
                        : on
                          ? "border-amber-300 bg-amber-50 text-amber-800"
                          : "border-violet-200 bg-violet-50 text-violet-700"
                    }`}
                  >
                    {verified ? "Operativo" : on ? "Sin prueba reciente" : "Cuenta propia"}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                  <span className="rounded border border-zinc-200 px-1.5 py-0.5 font-mono text-zinc-500">
                    {n ? `${n} en catálogo` : "Integración disponible"}
                  </span>
                  {executable ? (
                    <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-emerald-700">
                      {executable} tarifa{executable === 1 ? "" : "s"} verificada{executable === 1 ? "" : "s"}
                    </span>
                  ) : null}
                  <span
                    className={`rounded border px-1.5 py-0.5 ${
                      circuit === "open"
                        ? "border-rose-300 bg-rose-50 text-rose-800"
                        : zdr
                          ? "border-violet-200 bg-violet-50 text-violet-800"
                          : "border-zinc-200 text-zinc-500"
                    }`}
                  >
                    {circuit === "open"
                      ? "Interrupción detectada"
                      : zdr
                        ? "ZDR confirmado"
                        : p.zdrCapable
                          ? "ZDR sujeto a contrato"
                          : "Estándar"}
                  </span>
                </div>
                <div className="mt-3 text-xs text-violet-700 opacity-0 transition-opacity group-hover:opacity-100">
                  Ver proveedor →
                </div>
              </Link>
            );
          })}
        </div>

        <p className="mt-10 text-sm text-zinc-500">
          ¿Necesitás priorizar precio, velocidad o privacidad? Nexus puede elegir automáticamente o
          respetar el orden que definas.{" "}
          <Link href="/docs/provider-routing" className="text-violet-700 hover:underline">
            Cómo funciona el enrutamiento →
          </Link>
        </p>
      </div>
    </MarketingShell>
  );
}
