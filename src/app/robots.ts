import type { MetadataRoute } from "next";
import { APP_URL } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  const base = APP_URL.replace(/\/$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/overview", "/welcome", "/studio", "/activity", "/analytics", "/settings", "/api/"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
