import { APP_URL } from "./config";
import { NEXUS_PROVIDERS, isWired } from "@/lib/providers/registry";
import { searchEnginesWired } from "@/lib/search/web";

function present(value?: string) {
  return Boolean(value && value.trim());
}

export function connectionStatus() {
  return {
    appUrl: APP_URL,
    webhookUrl: `${APP_URL}/api/webhooks/stripe`,
    gatewayUrl: process.env.GATEWAY_URL ?? null,
    database: {
      id: "database",
      label: "Base de datos",
      wired: present(process.env.DATABASE_URL),
      hint: present(process.env.DATABASE_URL)
        ? "Postgres / Neon"
        : "PGlite local (./data/nexus). Para prod: DATABASE_URL",
      env: ["DATABASE_URL"],
    },
    auth: {
      id: "auth",
      label: "Auth",
      wired: present(process.env.BETTER_AUTH_SECRET),
      hint: "BETTER_AUTH_SECRET en .env.local",
      env: ["BETTER_AUTH_SECRET"],
    },
    stripe: {
      id: "stripe",
      label: "Stripe (créditos)",
      wired: present(process.env.STRIPE_SECRET_KEY),
      webhook: present(process.env.STRIPE_WEBHOOK_SECRET),
      hint: "STRIPE_SECRET_KEY + webhook a /api/webhooks/stripe",
      env: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    },
    redis: {
      id: "redis",
      label: "Redis",
      wired:
        present(process.env.REDIS_URL) ||
        present(process.env.UPSTASH_REDIS_REST_URL) ||
        present(process.env.KV_REST_API_URL),
      hint: "REDIS_URL, Upstash o Vercel KV. Sin esto: rate limit en memoria.",
      env: ["REDIS_URL", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL"],
    },
    providers: NEXUS_PROVIDERS.map((p) => ({
      id: p.id,
      label: p.label,
      env: p.env,
      wired: isWired(p),
    })),
    search: Object.entries(searchEnginesWired()).map(([id, wired]) => ({
      id,
      label: id === "duckduckgo" ? "DuckDuckGo (fallback)" : id,
      wired,
    })),
    manualCredits: process.env.ENABLE_MANUAL_CREDITS !== "false",
  };
}
