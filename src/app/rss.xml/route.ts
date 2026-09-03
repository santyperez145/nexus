import { BLOG_POSTS } from "@/lib/blog/posts";
import { APP_URL } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = BLOG_POSTS.map(
    (p) => `  <item>
    <title><![CDATA[${p.title}]]></title>
    <link>${APP_URL}/blog/${p.slug}</link>
    <guid isPermaLink="true">${APP_URL}/blog/${p.slug}</guid>
    <pubDate>${new Date(p.date + "T12:00:00Z").toUTCString()}</pubDate>
    <description><![CDATA[${p.summary}]]></description>
  </item>`,
  ).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Nexus Blog</title>
  <link>${APP_URL}/blog</link>
  <description>Changelog y notas de producto — sin tracción inventada.</description>
  <language>es</language>
${items}
</channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
