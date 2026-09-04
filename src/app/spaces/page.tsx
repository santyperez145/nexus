import Link from "next/link";
import { Boxes, Cpu, Play, ShieldCheck, Workflow } from "lucide-react";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { Button } from "@/components/ui/button";
import { ensureDb } from "@/lib/db";
import { listHubSpaces } from "@/lib/hub/space-store";

export const dynamic = "force-dynamic";

export default async function SpacesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; model?: string }>;
}) {
  await ensureDb();
  const filters = await searchParams;
  const [spaces, allPublic] = await Promise.all([
    listHubSpaces({ query: filters.q, model: filters.model, limit: 100 }),
    listHubSpaces({ limit: 100 }),
  ]);
  const models = new Set(allPublic.map((space) => space.model));
  const runs = allPublic.reduce((sum, space) => sum + space.runs, 0);

  return (
    <MarketingShell>
      <div className="relative mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-8 h-44 bg-[radial-gradient(ellipse_at_top,_rgba(34,211,238,0.09),_transparent_68%)]" />
        <div className="flex flex-wrap items-end justify-between gap-5">
          <MarketingPageHeader title="Nexus Spaces" className="mb-0">
            Aplicaciones de IA compartibles sobre el catálogo multi‑proveedor. Se ejecutan con un único gateway, identidad aislada, políticas ZDR y contabilidad transaccional.
          </MarketingPageHeader>
          <Button asChild className="mb-1 rounded-full px-4"><Link href="/settings/spaces">Crear Space</Link></Button>
        </div>

        <section className="nexus-console-grid mt-8 overflow-hidden rounded-2xl border border-indigo-950/15 bg-[#0b0e1a] text-white shadow-[0_18px_70px_rgba(17,19,38,0.14)]">
          <div className="grid gap-px bg-white/10 sm:grid-cols-3">
            {[
              ["Spaces públicos", allPublic.length.toLocaleString(), Boxes],
              ["Modelos activos", models.size.toLocaleString(), Cpu],
              ["Ejecuciones", runs.toLocaleString(), Play],
            ].map(([label, value, Icon]) => (
              <div key={String(label)} className="bg-[#0b0e1a]/95 px-5 py-5">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500"><Icon className="size-3.5 text-cyan-300" />{label as string}</div>
                <div className="mt-2 font-mono text-2xl text-zinc-100">{value as string}</div>
              </div>
            ))}
          </div>
        </section>

        <form className="mt-7 grid gap-3 rounded-2xl border border-indigo-950/10 bg-white p-3 shadow-sm sm:grid-cols-[1fr_16rem_auto]">
          <input name="q" defaultValue={filters.q} placeholder="Buscar por nombre, namespace o modelo…" aria-label="Buscar Spaces" className="h-10 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
          <input name="model" defaultValue={filters.model} placeholder="Modelo exacto, ej. nexus/auto" aria-label="Filtrar por modelo" className="h-10 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
          <Button type="submit" className="h-10 px-5">Filtrar</Button>
        </form>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {spaces.map((space) => (
            <Link key={space.id} href={`/spaces/${space.namespace}/${space.slug}`} className="group flex min-h-48 flex-col rounded-2xl border border-indigo-950/10 bg-white p-5 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-[0_15px_40px_rgba(17,19,38,0.07)]">
              <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2 font-mono text-xs text-indigo-600"><Boxes className="size-4 shrink-0" /><span className="truncate">{space.namespace}/{space.slug}</span>{space.namespaceVerified ? <ShieldCheck className="size-4 shrink-0 text-cyan-600" aria-label="Namespace verificado" /> : null}</div><span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-700">live</span></div>
              <h2 className="mt-4 text-lg font-semibold text-[#111326]">{space.title}</h2>
              <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-zinc-500">{space.description || "Experiencia de IA publicada en Nexus."}</p>
              <div className="mt-auto flex items-end justify-between gap-3 pt-5"><div><div className="text-[10px] uppercase tracking-[0.12em] text-zinc-400">Modelo</div><div className="mt-1 max-w-[16rem] truncate font-mono text-[11px] text-zinc-700">{space.model}</div></div><span className="flex items-center gap-1 font-mono text-[11px] text-zinc-500"><Workflow className="size-3.5" />{space.runs.toLocaleString()} runs</span></div>
            </Link>
          ))}
          {!spaces.length ? <div className="rounded-2xl border border-dashed border-indigo-200 bg-white px-6 py-16 text-center md:col-span-2"><Boxes className="mx-auto size-7 text-indigo-300" /><h2 className="mt-3 font-semibold text-zinc-900">No hay Spaces para este filtro</h2><p className="mt-1 text-sm text-zinc-500">Probá otra búsqueda o publicá la primera experiencia.</p></div> : null}
        </div>
      </div>
    </MarketingShell>
  );
}

