import { defineRailway, github, preserve, project, service } from "railway/iac";

// Last resort for a per-service CaC repo. Prefer one .railway file for the
// project and drop this if you later combine services into that file.
export const partial = "web";

export default defineRailway(() => {
  const web = service("web", {
    source: github("santyperez145/nexus"),
    healthcheck: "/api/internal/health/live",
    healthcheckTimeout: 30,
    preDeploy: "node scripts/migrate.mjs migrate",
    variables: {
      BETTER_AUTH_SECRET: preserve(),
      CREDENTIALS_SECRET: preserve(),
      CRON_SECRET: preserve(),
      DATABASE_URL: preserve(),
      DATABASE_URL_UNPOOLED: preserve(),
      ENABLE_MANUAL_CREDITS: preserve(),
      KV_REST_API_TOKEN: preserve(),
      KV_REST_API_URL: preserve(),
      NEXT_PUBLIC_APP_URL: preserve(),
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: preserve(),
      NODE_ENV: preserve(),
      POSTGRES_URL: preserve(),
      REDIS_URL: preserve(),
      STRIPE_PUBLISHABLE_KEY: preserve(),
      STRIPE_SECRET_KEY: preserve(),
      STRIPE_WEBHOOK_SECRET: preserve(),
    },
  });
  return project("nexus", {
    resources: [web],
  });
});
