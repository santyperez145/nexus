import type { MetadataRoute } from "next";
import { RECIPES } from "@/lib/apps/recipes";
import { BLOG_POSTS } from "@/lib/blog/posts";
import { APP_URL } from "@/lib/config";
import { NEXUS_PROVIDERS } from "@/lib/providers/registry";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = APP_URL.replace(/\/$/, "");
  const staticPaths = [
    "",
    "/models",
    "/datasets",
    "/chat",
    "/providers",
    "/rankings",
    "/compare",
    "/arena",
    "/apps",
    "/status",
    "/credits",
    "/enterprise",
    "/blog",
    "/docs",
    "/docs/provider-routing",
    "/docs/parameters",
    "/docs/streaming",
    "/docs/errors",
    "/docs/limits",
    "/privacy",
    "/terms",
  ];
  const now = new Date();
  return [
    ...staticPaths.map((path) => ({
      url: `${base}${path || "/"}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: path === "" ? 1 : 0.7,
    })),
    ...BLOG_POSTS.map((p) => ({
      url: `${base}/blog/${p.slug}`,
      lastModified: new Date(p.date),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...RECIPES.map((r) => ({
      url: `${base}/apps/${r.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...NEXUS_PROVIDERS.map((p) => ({
      url: `${base}/providers/${p.id}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
