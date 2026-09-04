import type { NextConfig } from "next";
import { DATA_PLANE_PROTOCOL_ROUTES } from "./src/lib/gateway/data-plane";

const gateway = process.env.GATEWAY_URL;

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "postgres", "ioredis"],
  experimental: { cpus: process.env.FLY_BUILD === "1" ? 4 : 2 },
  ...(process.env.FLY_BUILD === "1" ? { output: "standalone" as const } : {}),
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
      },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      {
        key: "Content-Security-Policy",
        value: "base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self' https://checkout.stripe.com",
      },
      ...(process.env.NODE_ENV === "production"
        ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
        : []),
    ];
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    const rootAlias = { source: "/v1/:path*", destination: "/api/v1/:path*" };
    if (!gateway) return [rootAlias];
    const protocols = ["chat", "completions", "embeddings", "rerank", "responses", "messages"] as const;
    return [
      ...protocols.flatMap((protocol) => [
        {
          source: `/api${DATA_PLANE_PROTOCOL_ROUTES[protocol]}`,
          destination: `${gateway}${DATA_PLANE_PROTOCOL_ROUTES[protocol]}`,
        },
        {
          source: DATA_PLANE_PROTOCOL_ROUTES[protocol],
          destination: `${gateway}${DATA_PLANE_PROTOCOL_ROUTES[protocol]}`,
        },
      ]),
      rootAlias,
    ];
  },
};

export default nextConfig;
