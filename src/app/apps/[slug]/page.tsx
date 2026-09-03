import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { findRecipe } from "@/lib/apps/recipes";

export default async function RecipePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const recipe = findRecipe(slug);
  if (!recipe) notFound();

  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl px-4 py-12 md:py-16">
        <p className="mb-3 text-sm text-zinc-500">
          <Link href="/apps" className="text-amber-700 hover:underline">
            Apps
          </Link>
          <span className="mx-2 text-zinc-300">/</span>
          Recipe
        </p>
        <MarketingPageHeader title={recipe.title}>{recipe.blurb}</MarketingPageHeader>
        <div className="mb-6 flex flex-wrap gap-2">
          {recipe.tags.map((t) => (
            <span
              key={t}
              className="rounded border border-zinc-200 bg-white px-2 py-0.5 font-mono text-[11px] text-zinc-600"
            >
              {t}
            </span>
          ))}
          <Link
            href={`/chat?model=${encodeURIComponent(recipe.model)}`}
            className="rounded border border-amber-600/30 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800 hover:underline"
          >
            Probar en chat →
          </Link>
          {recipe.tags.includes("media") || recipe.tags.includes("image") ? (
            <Link
              href="/studio"
              className="rounded border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-700 hover:underline"
            >
              Abrir Studio →
            </Link>
          ) : null}
          {(recipe.tags.includes("envelope") || recipe.slug.includes("messages") || recipe.slug.includes("responses")) ? (
            <Link
              href="/docs/envelopes"
              className="rounded border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-700 hover:underline"
            >
              Docs envelopes →
            </Link>
          ) : null}
        </div>
        <h2 className="mb-2 text-sm font-medium text-zinc-900">curl</h2>
        <pre className="mb-6 overflow-x-auto rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-800">
          {recipe.curl}
        </pre>
        <h2 className="mb-2 text-sm font-medium text-zinc-900">nexus-sdk</h2>
        <pre className="overflow-x-auto rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-800">
          {recipe.sdk}
        </pre>
      </div>
    </MarketingShell>
  );
}
