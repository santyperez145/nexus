import Link from "next/link";
import { notFound } from "next/navigation";
import { Boxes, Gauge, Play, ShieldCheck, Workflow } from "lucide-react";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { SpaceRunner } from "@/components/spaces/space-runner";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { sessionAuthContext } from "@/lib/gateway/api-auth";
import { hubTenantAccess } from "@/lib/hub/datasets";
import { canReadHubSpace, findHubSpace } from "@/lib/hub/space-store";

export const dynamic = "force-dynamic";

export default async function SpacePage({ params }: { params: Promise<{ namespace: string; slug: string }> }) {
  const { namespace, slug } = await params;
  const session = await getSession();
  const auth = session?.user ? await sessionAuthContext(session.user.id) : null;
  const space = await findHubSpace(namespace, slug);
  if (!space || !canReadHubSpace(space, auth)) notFound();
  const manager = hubTenantAccess(auth, space);

  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-4 py-8 md:py-12">
        <nav className="mb-5 flex items-center gap-2 font-mono text-xs text-zinc-500"><Link href="/spaces" className="hover:text-indigo-700">spaces</Link><span>/</span><span>{space.namespace}</span><span>/</span><span className="text-zinc-900">{space.slug}</span></nav>
        <header className="mb-6 overflow-hidden rounded-2xl border border-indigo-950/10 bg-white shadow-[0_16px_60px_rgba(17,19,38,0.07)]">
          <div className="nexus-console-grid border-b border-white/10 bg-[#0b0e1a] px-6 py-6 text-white md:px-8">
            <div className="flex flex-wrap items-start justify-between gap-5"><div><div className="flex flex-wrap items-center gap-2 font-mono text-xs text-cyan-300"><Boxes className="size-4" />{space.namespace}/{space.slug}{space.namespaceVerified ? <ShieldCheck className="size-4" aria-label="Verificado" /> : null}<span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">live</span></div><h1 className="mt-3 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight text-white">{space.title}</h1><p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">{space.description || "Space multi‑proveedor ejecutado sobre Nexus."}</p></div>{manager ? <Button asChild variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"><Link href={`/settings/spaces/${space.namespace}/${space.slug}`}>Configurar</Link></Button> : null}</div>
          </div>
          <div className="grid gap-px bg-zinc-200 sm:grid-cols-4">{[["Modelo", space.model, Workflow], ["Temperatura", (space.temperatureMilli / 1000).toFixed(1), Gauge], ["Máx. salida", `${space.maxTokens.toLocaleString()} tok`, Boxes], ["Ejecuciones", space.runs.toLocaleString(), Play]].map(([label, value, Icon]) => <div key={String(label)} className="bg-white px-5 py-4"><div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-zinc-400"><Icon className="size-3" />{label as string}</div><div className="mt-1 truncate font-mono text-sm text-zinc-800" title={String(value)}>{value as string}</div></div>)}</div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <SpaceRunner namespace={space.namespace} slug={space.slug} starterPrompt={space.starterPrompt} />
          <aside className="space-y-4">
            <section className="rounded-2xl border border-indigo-950/10 bg-white p-4"><h2 className="text-sm font-semibold text-zinc-900">Contrato de ejecución</h2><div className="mt-3 grid gap-2 text-xs text-zinc-600"><div className="flex justify-between"><span>Identidad</span><span className="font-mono">runner</span></div><div className="flex justify-between"><span>Facturación</span><span className="font-mono">reserve→settle</span></div><div className="flex justify-between"><span>Privacidad</span><span className="font-mono">cuenta/tenant</span></div><div className="flex justify-between"><span>Fallbacks</span><span className="font-mono">gateway</span></div></div></section>
            <section className="rounded-2xl border border-indigo-950/10 bg-white p-4"><h2 className="text-sm font-semibold text-zinc-900">Instrucciones publicadas</h2><p className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-xs leading-5 text-zinc-600">{space.systemPrompt || "Este Space no agrega una instrucción de sistema."}</p></section>
            {!session?.user ? <section className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4"><p className="text-xs leading-5 text-indigo-900">Explorá el Space públicamente. Para ejecutarlo, ingresá y Nexus aplicará tu saldo, límites y preferencias de privacidad.</p><Button asChild size="sm" className="mt-3 w-full"><Link href="/login">Ingresar</Link></Button></section> : null}
          </aside>
        </div>
      </div>
    </MarketingShell>
  );
}

