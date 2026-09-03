import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { BLOG_POSTS } from "@/lib/blog/posts";

export default function BlogIndexPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl px-4 py-12 md:py-16">
        <MarketingPageHeader title="Blog">
          Changelog y notas de producto. Sin anuncios de tracción inventada.
        </MarketingPageHeader>
        <ul className="grid gap-3">
          {BLOG_POSTS.map((p) => (
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
