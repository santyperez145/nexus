import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  commercialLaunchReady,
  configuredCapabilities,
  inferencePlaneReady,
  productionConfigIssues,
} from "../src/lib/health/readiness";

const productionEnv = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://nexus:secret@db.example.com/nexus",
  REDIS_URL: "rediss://default:secret@redis.example.com:6379",
  BETTER_AUTH_SECRET: "a".repeat(32),
  CREDENTIALS_SECRET: "b".repeat(32),
  RESEND_API_KEY: "re_test",
  EMAIL_FROM: "Nexus <accounts@example.com>",
  CRON_SECRET: "c".repeat(32),
  NEXT_PUBLIC_APP_URL: "https://nexus.example.com",
};

describe("production readiness configuration", () => {
  it("fails closed when production has no durable infrastructure or secrets", () => {
    assert.deepEqual(productionConfigIssues({ NODE_ENV: "production" }), [
      "database_url",
      "distributed_redis",
      "auth_secret",
      "credentials_secret",
      "transactional_email",
      "cron_secret",
      "https_app_url",
    ]);
  });

  it("accepts a complete production control-plane configuration", () => {
    assert.deepEqual(productionConfigIssues(productionEnv), []);
  });

  it("reports commercial capabilities without treating them as process health", () => {
    assert.deepEqual(configuredCapabilities(productionEnv), {
      inferenceConfigured: false,
      commerceConfigured: false,
    });
    assert.deepEqual(
      configuredCapabilities({
        ...productionEnv,
        OPENAI_API_KEY: "sk-provider",
        STRIPE_SECRET_KEY: "sk_test",
        STRIPE_WEBHOOK_SECRET: "whsec_test",
        STRIPE_PRICE_PRO_MONTHLY: "price_pro",
        STRIPE_PRICE_TEAM_MONTHLY: "price_team",
        STRIPE_PORTAL_CONFIGURATION_ID: "bpc_nexus",
      }),
      { inferenceConfigured: true, commerceConfigured: true },
    );
  });

  it("does not declare customer traffic ready without inference and commerce", () => {
    const snapshot = {
      ok: true,
      service: "nexus-control-plane" as const,
      checkedAt: new Date(0).toISOString(),
      checks: {
        configuration: { ok: true, latencyMs: 0 },
        database: { ok: true, latencyMs: 1 },
        redis: { ok: true, latencyMs: 1 },
      },
      capabilities: {
        inferenceConfigured: false,
        inferenceOperational: false,
        commerceConfigured: false,
        commerceOperational: false,
      },
    };
    assert.equal(commercialLaunchReady(snapshot), false);
    assert.equal(
      commercialLaunchReady({
        ...snapshot,
        capabilities: {
          inferenceConfigured: true,
          inferenceOperational: true,
          commerceConfigured: true,
          commerceOperational: true,
        },
      }),
      true,
    );
    assert.equal(
      commercialLaunchReady({
        ...snapshot,
        capabilities: {
          inferenceConfigured: true,
          inferenceOperational: false,
          commerceConfigured: true,
          commerceOperational: true,
        },
      }),
      false,
    );
  });

  it("keeps the data plane closed without a recent executable provider probe", () => {
    const snapshot = {
      ok: true,
      service: "nexus-control-plane" as const,
      checkedAt: new Date(0).toISOString(),
      checks: {
        configuration: { ok: true, latencyMs: 0 },
        database: { ok: true, latencyMs: 1 },
        redis: { ok: true, latencyMs: 1 },
      },
      capabilities: {
        inferenceConfigured: true,
        inferenceOperational: false,
        commerceConfigured: true,
        commerceOperational: true,
      },
    };
    assert.equal(inferencePlaneReady(snapshot), false);
    assert.equal(
      inferencePlaneReady({
        ...snapshot,
        capabilities: { ...snapshot.capabilities, inferenceOperational: true },
      }),
      true,
    );
  });
});
