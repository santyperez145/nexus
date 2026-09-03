import { APP_URL, manualCreditsEnabled } from "./config";
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
      wired: present(process.env.DATABASE_URL) || present(process.env.POSTGRES_URL),
      hint: present(process.env.DATABASE_URL) || present(process.env.POSTGRES_URL)
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
      label: "Stripe (créditos + suscripciones)",
      wired: present(process.env.STRIPE_SECRET_KEY),
      webhook: present(process.env.STRIPE_WEBHOOK_SECRET),
      plans: present(process.env.STRIPE_PRICE_PRO_MONTHLY) && present(process.env.STRIPE_PRICE_TEAM_MONTHLY),
      hint: "Secret, webhook y Price IDs Pro/Team",
      env: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_PRO_MONTHLY", "STRIPE_PRICE_TEAM_MONTHLY"],
    },
    redis: {
      id: "redis",
      label: "Redis",
      wired:
        present(process.env.REDIS_URL) ||
        (present(process.env.UPSTASH_REDIS_REST_URL) && present(process.env.UPSTASH_REDIS_REST_TOKEN)) ||
        (present(process.env.KV_REST_API_URL) && present(process.env.KV_REST_API_TOKEN)),
      hint: "REDIS_URL, Upstash o Vercel KV. Producción falla cerrado si falta.",
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
    manualCredits: manualCreditsEnabled(),
  };
}
