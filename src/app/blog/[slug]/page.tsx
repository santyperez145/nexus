import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { BLOG_POSTS, getPost } from "@/lib/blog/posts";

export function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  return (
    <MarketingShell>
      <article className="mx-auto max-w-2xl px-4 py-12 md:py-16">
        <Link href="/blog" className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Blog
        </Link>
        <p className="mt-6 text-[11px] uppercase tracking-[0.08em] text-zinc-400">{post.date}</p>
        <h1 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight text-zinc-950 md:text-4xl">
          {post.title}
        </h1>
        <p className="mt-3 text-lg text-zinc-500">{post.summary}</p>
        <div className="mt-8 space-y-4 text-sm leading-7 text-zinc-600">
          {post.body.map((para) => (
            <p key={para.slice(0, 48)}>{para}</p>
          ))}
        </div>
      </article>
    </MarketingShell>
  );
}
