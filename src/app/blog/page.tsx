import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { BLOG_POSTS } from "@/lib/blog/posts";

export default function BlogIndexPage() {
  const [featured, ...rest] = BLOG_POSTS;

  return (
    <MarketingShell>
      <div className="relative mx-auto max-w-3xl px-4 py-12 md:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-6 h-40 bg-[radial-gradient(ellipse_at_top,_rgba(217,119,6,0.1),_transparent_70%)]"
        />
        <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
          <MarketingPageHeader title="Blog">
            Changelog y notas de producto. Sin anuncios de tracción inventada.
          </MarketingPageHeader>
          <Link
            href="/rss.xml"
            className="mb-6 shrink-0 text-sm text-amber-700 hover:underline"
          >
            RSS →
          </Link>
        </div>

        {featured ? (
          <Link
            href={`/blog/${featured.slug}`}
            className="mb-6 block rounded-2xl border border-zinc-200 bg-white px-5 py-6 transition-colors hover:border-amber-600/40"
          >
            <div className="text-[11px] uppercase tracking-[0.1em] text-amber-700">Featured</div>
            <div className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-semibold text-zinc-900 md:text-3xl">
              {featured.title}
            </div>
            <p className="mt-2 text-sm text-zinc-500">{featured.summary}</p>
            <div className="mt-3 text-[11px] uppercase tracking-[0.08em] text-zinc-400">
              {featured.date}
            </div>
          </Link>
        ) : null}

        <ul className="grid gap-3">
          {rest.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/blog/${p.slug}`}
                className="block rounded-xl border border-zinc-200 bg-white px-4 py-4 transition-colors hover:border-amber-600/40"
              >
                <div className="text-[11px] uppercase tracking-[0.08em] text-zinc-400">{p.date}</div>
                <div className="mt-1 font-[family-name:var(--font-syne)] text-xl font-semibold text-zinc-900">
                  {p.title}
                </div>
                <p className="mt-1.5 text-sm text-zinc-500">{p.summary}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </MarketingShell>
  );
}
