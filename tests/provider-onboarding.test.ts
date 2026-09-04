import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { AuthContext } from "../src/lib/gateway/types";

const dataDir = mkdtempSync(join(tmpdir(), "nexus-provider-onboarding-test-"));
process.env.ENABLE_PGLITE = "true";
process.env.PGLITE_DATA_DIR = dataDir;
process.env.CREDENTIALS_SECRET = "nexus-provider-onboarding-secret-32-chars";
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.POSTGRES_PRISMA_URL;

let database: typeof import("../src/lib/db");
let onboarding: typeof import("../src/lib/providers/onboarding");
let router: typeof import("../src/lib/gateway/router");
let connectionId = "";
let offeringId = "";

const actorId = "usr_provider_operator";
const auth: AuthContext = {
  userId: actorId,
  isManagement: true,
  scopes: ["*"],
  plan: "team",
  creditMicros: 10_000_000,
  zdr: false,
  allowTraining: true,
  logPrompts: false,
};

before(async () => {
  database = await import("../src/lib/db");
  onboarding = await import("../src/lib/providers/onboarding");
  router = await import("../src/lib/gateway/router");
  await database.ensureDb();
  await database.db.insert(database.schema.users).values({
    id: actorId,
    name: "Provider Operator",
    email: "provider-operator@nexus.test",
    plan: "team",
  });
  const connection = await onboarding.createProviderConnection(actorId, {
    slug: "acme-ai",
    label: "Acme AI",
    protocol: "openai",
    auth_scheme: "bearer",
    base_url: "https://api.example.com/v1",
    models_path: "/models",
    api_key: "acme-secret-key",
    zdr_capable: true,
    privacy_policy_url: "https://example.com/privacy",
    terms_url: "https://example.com/terms",
    status_page_url: null,
  });
  connectionId = connection.id;
  const discovered = onboarding.normalizeDiscoveredOffering(
    {
      id: "acme/model-one",
      name: "Model One",
      context_length: 131072,
      pricing: { prompt: "0.000001", completion: "0.000002" },
      supported_features: ["tools", "structured_outputs"],
      architecture: { input_modalities: ["text"], output_modalities: ["text"] },
      capacity_tpm: 2_000_000,
      is_ready: true,
    },
    "acme-ai",
  );
  offeringId = "poff_provider_test";
  await database.db.insert(database.schema.providerOfferings).values({
    id: offeringId,
    connectionId,
    ...discovered,
  });
});

after(async () => {
  await database.closeDbForTests();
  rmSync(dataDir, { recursive: true, force: true });
});

describe("managed provider onboarding", () => {
  it("enforces public HTTPS endpoints and contract drift hashes", () => {
    assert.throws(() => onboarding.normalizeProviderBaseUrl("http://api.example.com/v1"), /HTTPS/);
    assert.throws(() => onboarding.normalizeProviderBaseUrl("https://127.0.0.1/v1"), /public host/);
    assert.throws(() => onboarding.normalizeProviderModelsPath("//metadata/models"), /absolute path/);
    assert.equal(
      onboarding.createProviderConnectionSchema.safeParse({
        slug: "unsafe-auth",
        label: "Unsafe auth",
        protocol: "anthropic",
        auth_scheme: "bearer",
        base_url: "https://api.example.com/v1",
        models_path: "/models",
        api_key: "secret-key",
      }).success,
      false,
    );
    const one = onboarding.normalizeDiscoveredOffering(
      { id: "vendor/model", pricing: { prompt: "0.1", completion: "0.2" } },
      "vendor",
    );
    const changed = onboarding.normalizeDiscoveredOffering(
      { id: "vendor/model", pricing: { prompt: "0.1", completion: "0.3" } },
      "vendor",
    );
    assert.notEqual(one.sourceHash, changed.sourceHash);
  });

  it("fails closed until health, privacy and pricing are all reviewed", async () => {
    assert.deepEqual(await onboarding.loadManagedProviderModels(), []);
    await assert.rejects(
      onboarding.reviewProviderOffering(offeringId, actorId, {
        action: "activate",
        canonical_model_id: "acme/model-one",
        free: false,
        cost_prompt: 0.000001,
        cost_completion: 0.000002,
      }),
      /health, readiness and pricing/,
    );

    const now = new Date();
    await database.db
      .update(database.schema.providerConnections)
      .set({ lastProbeOk: true, lastProbeStatus: 200, lastProbedAt: now })
      .where(eq(database.schema.providerConnections.id, connectionId));
    await onboarding.updateProviderConnection(connectionId, actorId, {
      action: "activate",
      zdr_verified: true,
      no_training_verified: true,
    });
    await onboarding.reviewProviderOffering(offeringId, actorId, {
      action: "activate",
      canonical_model_id: "acme/model-one",
      free: false,
      cost_prompt: 0.000001,
      cost_completion: 0.000002,
    });

    const models = await onboarding.loadManagedProviderModels();
    assert.equal(models.length, 1);
    assert.equal(models[0].endpoints[0].pricing.prompt, 0.000001);
    assert.equal(models[0].endpoints[0].pricing.completion, 0.000002);
    assert.equal(models[0].endpoints[0].zdrVerified, true);
    assert.equal(models[0].endpoints[0].noTrainingVerified, true);
    assert.equal(
      router.resolveRouteFromCatalog(
        { model: "acme/model-one", messages: [{ role: "user", content: "hello" }] },
        auth,
        models,
      ).models.length,
      1,
    );
    const credential = await onboarding.loadActiveProviderCredential(models[0].endpoints[0]);
    assert.equal(credential?.apiKey, "acme-secret-key");

    await database.db
      .update(database.schema.providerConnections)
      .set({ noTrainingVerified: false })
      .where(eq(database.schema.providerConnections.id, connectionId));
    assert.equal(await onboarding.loadActiveProviderCredential(models[0].endpoints[0]), null);
    await database.db
      .update(database.schema.providerConnections)
      .set({ noTrainingVerified: true })
      .where(eq(database.schema.providerConnections.id, connectionId));

    await database.db
      .update(database.schema.providerOfferings)
      .set({ costCompletionPrice: "0.000003000000000" })
      .where(eq(database.schema.providerOfferings.id, offeringId));
    assert.equal(await onboarding.loadActiveProviderCredential(models[0].endpoints[0]), null);
    await database.db
      .update(database.schema.providerOfferings)
      .set({ costCompletionPrice: "0.000002000000000" })
      .where(eq(database.schema.providerOfferings.id, offeringId));
  });

  it("removes credentials and routes immediately when the provider is suspended", async () => {
    const [model] = await onboarding.loadManagedProviderModels();
    await onboarding.updateProviderConnection(connectionId, actorId, { action: "suspend" });
    assert.deepEqual(await onboarding.loadManagedProviderModels(), []);
    assert.equal(await onboarding.loadActiveProviderCredential(model.endpoints[0]), null);
  });

  it("passes provider list price through without a hidden inference markup", () => {
    assert.equal(onboarding.NEXUS_PROVIDER_MARKUP_BPS, 0);
    assert.equal(onboarding.priceWithMarkup(1), 1);
    assert.equal(onboarding.priceWithMarkup(0), 0);
    assert.equal(
      onboarding.offeringCanActivate({
        providerReady: true,
        connectionActive: true,
        connectionHealthy: true,
        free: false,
        prompt: 0,
        completion: 0,
      }),
      false,
    );
  });
});
