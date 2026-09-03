import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { BLOG_POSTS, getPost } from "@/lib/blog/posts";

export function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

const RELATED_LINKS: Record<string, Array<{ href: string; label: string }>> = {
  "guest-playground-eco": [
    { href: "/chat", label: "Chat guest" },
    { href: "/docs", label: "Docs" },
    { href: "/arena", label: "Arena" },
  ],
  "gateway-openai-compatible": [
    { href: "/docs", label: "API docs" },
    { href: "/models", label: "Models" },
    { href: "/credits", label: "Credits" },
  ],
  "zdr-route-trace": [
    { href: "/settings/privacy", label: "Privacy" },
    { href: "/docs/provider-routing", label: "Routing docs" },
    { href: "/chat", label: "Playground" },
  ],
  "media-studio-sdk": [
    { href: "/studio", label: "Studio" },
    { href: "/docs/media", label: "Media docs" },
  ],
  "vision-envelopes-arena": [
    { href: "/docs/envelopes", label: "Envelopes" },
    { href: "/arena", label: "Arena" },
    { href: "/docs/media", label: "Media" },
  ],
  "chat-share-rss": [
    { href: "/apps", label: "Apps / recipes" },
    { href: "/rss.xml", label: "RSS" },
  ],
};

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const related = RELATED_LINKS[slug] ?? [
    { href: "/docs", label: "Docs" },
    { href: "/models", label: "Models" },
  ];
  const others = BLOG_POSTS.filter((p) => p.slug !== slug).slice(0, 3);

  return (
    <MarketingShell>
      <article className="relative mx-auto max-w-2xl px-4 py-12 md:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-6 h-40 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.08),_transparent_70%)]"
        />
        <Link href="/blog" className="relative text-sm text-zinc-500 hover:text-zinc-900">
          ← Blog
        </Link>
        <p className="relative mt-6 text-[11px] uppercase tracking-[0.08em] text-zinc-400">
          {post.date}
        </p>
        <h1 className="relative mt-2 text-3xl font-semibold tracking-tight text-zinc-950 md:text-4xl">
          {post.title}
        </h1>
        <p className="relative mt-3 text-lg text-zinc-500">{post.summary}</p>

        <div className="relative mt-6 rounded-xl border border-violet-200/80 bg-violet-50/60 px-4 py-3 text-sm text-zinc-700">
          Changelog honesto — sin métricas de tracción inventadas. Cableá labs en{" "}
          <Link href="/status" className="underline hover:text-zinc-900">
            /status
          </Link>{" "}
          para ver live vs echo.
        </div>

        <div className="relative mt-8 space-y-4 text-sm leading-7 text-zinc-600">
          {post.body.map((para) => (
            <p key={para.slice(0, 48)}>{para}</p>
          ))}
        </div>

        <div className="relative mt-10 flex flex-wrap gap-2">
          {related.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-violet-800 hover:border-zinc-300"
            >
              {l.label} →
            </Link>
          ))}
        </div>

        {others.length ? (
          <section className="relative mt-12 border-t border-zinc-200 pt-8">
            <h2 className="text-lg font-semibold text-zinc-900">
              Más notas
            </h2>
            <ul className="mt-3 grid gap-2">
              {others.map((p) => (
                <li key={p.slug}>
                  <Link
                    href={`/blog/${p.slug}`}
                    className="block rounded-lg border border-zinc-200 bg-white px-3 py-2.5 hover:border-zinc-300"
                  >
                    <div className="text-[11px] uppercase tracking-wide text-zinc-400">{p.date}</div>
                    <div className="font-medium text-zinc-900">{p.title}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </MarketingShell>
  );
}
