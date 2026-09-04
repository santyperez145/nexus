import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { isExecutableEndpoint, isTokenGatewayModel } from "@/lib/catalog";
import { allRuntimeModels } from "@/lib/catalog/runtime";
import { db, ensureDb } from "@/lib/db";
import { NEXUS_PROVIDERS } from "@/lib/providers/registry";
import {
  isStripeOperational,
  recentOperationalProviderIds,
} from "@/lib/providers/health-store";
import { cache } from "@/lib/redis";
import { probeArtifactStorage } from "@/lib/files/blob-store";
import { listPublicManagedProviders } from "@/lib/providers/onboarding";

type RuntimeEnv = Record<string, string | undefined>;

export type ReadinessCheck = {
  ok: boolean;
  latencyMs: number;
  detail?: string;
};

export type ReadinessSnapshot = {
  ok: boolean;
  service: "nexus-control-plane";
  checkedAt: string;
  checks: {
    configuration: ReadinessCheck;
    database: ReadinessCheck;
    redis: ReadinessCheck;
    objectStorage: ReadinessCheck;
  };
  capabilities: {
    inferenceConfigured: boolean;
    inferenceOperational: boolean;
    commerceConfigured: boolean;
    commerceOperational: boolean;
    artifactStorageConfigured: boolean;
  };
};

export function commercialLaunchReady(snapshot: ReadinessSnapshot) {
  return (
    snapshot.ok &&
    snapshot.capabilities.inferenceConfigured &&
    snapshot.capabilities.inferenceOperational &&
    snapshot.capabilities.commerceConfigured &&
    snapshot.capabilities.commerceOperational
  );
}

export function inferencePlaneReady(snapshot: ReadinessSnapshot) {
  return (
    snapshot.ok &&
    snapshot.capabilities.inferenceConfigured &&
    snapshot.capabilities.inferenceOperational
  );
}

function present(value?: string) {
  return Boolean(value?.trim());
}

function hasDistributedRedis(env: RuntimeEnv) {
  return Boolean(
    present(env.REDIS_URL) ||
      (present(env.UPSTASH_REDIS_REST_URL) && present(env.UPSTASH_REDIS_REST_TOKEN)) ||
      (present(env.KV_REST_API_URL) && present(env.KV_REST_API_TOKEN)),
  );
}

function configuredAppUrl(env: RuntimeEnv) {
  if (present(env.NEXT_PUBLIC_APP_URL)) return env.NEXT_PUBLIC_APP_URL!;
  if (present(env.VERCEL_PROJECT_PRODUCTION_URL)) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (present(env.RAILWAY_PUBLIC_DOMAIN)) return `https://${env.RAILWAY_PUBLIC_DOMAIN}`;
  if (present(env.FLY_APP_NAME)) return `https://${env.FLY_APP_NAME}.fly.dev`;
  if (present(env.VERCEL_URL)) return `https://${env.VERCEL_URL}`;
  return "";
}

export function productionConfigIssues(env: RuntimeEnv = process.env) {
  if (env.NODE_ENV !== "production") return [];
  const issues: string[] = [];
  if (!present(env.DATABASE_URL) && !present(env.POSTGRES_URL) && !present(env.POSTGRES_PRISMA_URL)) {
    issues.push("database_url");
  }
  if (!hasDistributedRedis(env)) issues.push("distributed_redis");
  if ((env.BETTER_AUTH_SECRET?.length ?? 0) < 32) issues.push("auth_secret");
  if ((env.CREDENTIALS_SECRET?.length ?? 0) < 32) issues.push("credentials_secret");
  if (!present(env.RESEND_API_KEY) || !present(env.EMAIL_FROM)) issues.push("transactional_email");
  if ((env.CRON_SECRET?.length ?? 0) < 32) issues.push("cron_secret");
  const appUrl = configuredAppUrl(env);
  if (!appUrl.startsWith("https://")) issues.push("https_app_url");
  if (env.NEXUS_OBJECT_STORAGE_REQUIRED === "true" && !present(env.NEXUS_OBJECT_STORAGE_BUCKET)) {
    issues.push("object_storage");
  }
  return issues;
}

export function configuredCapabilities(env: RuntimeEnv = process.env) {
  const inferenceConfigured = NEXUS_PROVIDERS.some((provider) => {
    const hasKey = [provider.env, ...(provider.extraEnv ?? [])].some((key) => present(env[key]));
    if (!hasKey) return false;
    if (provider.id === "cloudflare") return present(env.CLOUDFLARE_ACCOUNT_ID);
    if (provider.id === "azure") return present(env.AZURE_OPENAI_ENDPOINT);
    if (provider.id === "google-vertex") return present(env.GOOGLE_VERTEX_PROJECT);
    if (provider.id === "compat") return present(env.OPENAI_COMPAT_BASE_URL);
    return true;
  });
  return {
    inferenceConfigured,
    artifactStorageConfigured: present(env.NEXUS_OBJECT_STORAGE_BUCKET),
    commerceConfigured: Boolean(
      present(env.STRIPE_SECRET_KEY) &&
        present(env.STRIPE_WEBHOOK_SECRET) &&
        present(env.STRIPE_PRICE_PRO_MONTHLY) &&
        present(env.STRIPE_PRICE_TEAM_MONTHLY) &&
        present(env.STRIPE_PORTAL_CONFIGURATION_ID),
    ),
  };
}

function safeDetail(error: unknown) {
  if (!(error instanceof Error)) return "unavailable";
  if (/timeout/i.test(error.message)) return "timeout";
  return "unavailable";
}

async function runCheck(work: () => Promise<void>, timeoutMs = 3_000): Promise<ReadinessCheck> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("readiness timeout")), timeoutMs);
      }),
    ]);
    return { ok: true, latencyMs: Date.now() - started };
  } catch (error) {
    return { ok: false, latencyMs: Date.now() - started, detail: safeDetail(error) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function readinessSnapshot(): Promise<ReadinessSnapshot> {
  const issues = productionConfigIssues();
  const configuration: ReadinessCheck = {
    ok: issues.length === 0,
    latencyMs: 0,
    ...(issues.length ? { detail: issues.join(",") } : {}),
  };
  const storageConfigured = Boolean(process.env.NEXUS_OBJECT_STORAGE_BUCKET?.trim());
  const [database, redis, objectStorage] = await Promise.all([
    runCheck(async () => {
      await ensureDb();
      await db.execute(sql`select 1 as ready`);
    }),
    runCheck(async () => {
      const store = await cache();
      const key = `health:readiness:${randomUUID()}`;
      const value = randomUUID();
      await store.set(key, value, 30);
      if ((await store.get(key)) !== value) throw new Error("readiness value mismatch");
    }),
    storageConfigured
      ? runCheck(probeArtifactStorage)
      : Promise.resolve({ ok: true, latencyMs: 0, detail: "optional_unconfigured" }),
  ]);
  const checks = { configuration, database, redis, objectStorage };
  const configured = configuredCapabilities();
  let operationalProviders = new Set<string>();
  let managedProviders: Awaited<ReturnType<typeof listPublicManagedProviders>> = [];
  let stripeOperational = false;
  if (database.ok) {
    try {
      [operationalProviders, stripeOperational, managedProviders] = await Promise.all([
        recentOperationalProviderIds(),
        isStripeOperational(),
        listPublicManagedProviders(),
      ]);
    } catch {
      operationalProviders = new Set();
      stripeOperational = false;
      managedProviders = [];
    }
  }
  for (const provider of managedProviders) {
    if (provider.operational) operationalProviders.add(provider.id);
  }
  const runtimeCatalog = await allRuntimeModels();
  const executableProviderIds = new Set(
    runtimeCatalog.flatMap((model) =>
      isTokenGatewayModel(model)
        ? model.endpoints.filter(isExecutableEndpoint).map((endpoint) => endpoint.adapter)
        : [],
    ),
  );
  const inferenceOperational = [...operationalProviders].some((provider) =>
    executableProviderIds.has(provider),
  );
  return {
    ok: Object.values(checks).every((check) => check.ok),
    service: "nexus-control-plane",
    checkedAt: new Date().toISOString(),
    checks,
    capabilities: {
      ...configured,
      inferenceConfigured:
        configured.inferenceConfigured || managedProviders.length > 0,
      inferenceOperational,
      commerceOperational: configured.commerceConfigured && stripeOperational,
    },
  };
}
