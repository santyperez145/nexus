import type { NextConfig } from "next";

const gateway = process.env.GATEWAY_URL;

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "postgres", "ioredis"],
  experimental: { cpus: process.env.FLY_BUILD === "1" ? 4 : 2 },
  ...(process.env.FLY_BUILD === "1" ? { output: "standalone" as const } : {}),
  async rewrites() {
    if (!gateway) return [];
    return [
      { source: "/api/v1/chat/:path*", destination: `${gateway}/v1/chat/:path*` },
      { source: "/api/v1/completions", destination: `${gateway}/v1/completions` },
    ];
  },
};

export default nextConfig;
