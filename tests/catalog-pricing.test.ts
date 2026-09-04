import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  allModels,
  isExecutableEndpoint,
  isFreeEndpoint,
} from "../src/lib/catalog";
import { normalizeUpstream } from "../src/lib/catalog/normalize";
import { resolveRoute } from "../src/lib/gateway/router";
import type { AuthContext } from "../src/lib/gateway/types";
import type { ModelEndpoint } from "../src/lib/catalog/types";
import { isTextModelExecutionReady } from "../src/lib/catalog/presentation";
import { GET as listModels } from "../src/app/api/v1/models/route";

const auth: AuthContext = {
  userId: "usr_catalog_pricing",
  isManagement: false,
  creditMicros: 10_000_000,
  zdr: false,
  allowTraining: true,
  logPrompts: false,
};

after(async () => {
  const database = await import("../src/lib/db");
  await database.closeDbForTests();
});

function endpoint(overrides: Partial<ModelEndpoint> = {}): ModelEndpoint {
  return {
    name: "provider",
    adapter: "provider",
    providerModel: "model",
    pricing: { prompt: 0, completion: 0 },
    latencyMs: 0,
    throughputTps: 0,
    zdr: false,
    uptime: 0,
    quantization: "unknown",
    ...overrides,
  };
}

describe("catalog pricing trust", () => {
  it("distinguishes an unknown zero from an explicitly verified free tariff", () => {
    assert.equal(isExecutableEndpoint(endpoint()), false);
    assert.equal(
      isExecutableEndpoint(endpoint({ pricingVerified: true })),
      false,
      "zero cannot silently become free",
    );

    const free = endpoint({ pricingVerified: true, free: true });
    assert.equal(isExecutableEndpoint(free), true);
    assert.equal(isFreeEndpoint(free), true);
    assert.equal(
      isExecutableEndpoint(
        endpoint({ pricingVerified: true, free: true, pricing: { prompt: 0.1, completion: 0 } }),
      ),
      false,
      "a paid tariff cannot be mislabeled free",
    );
  });

  it("rejects malformed and unreviewed paid tariffs", () => {
    assert.equal(
      isExecutableEndpoint(
        endpoint({ pricingVerified: true, pricing: { prompt: 0.000001, completion: 0 } }),
      ),
      true,
    );
    assert.equal(
      isExecutableEndpoint(
        endpoint({ pricingVerified: true, pricing: { prompt: -1, completion: 0 } }),
      ),
      false,
    );
    assert.equal(
      isExecutableEndpoint(
        endpoint({ pricingVerified: false, pricing: { prompt: 0.000001, completion: 0.000002 } }),
      ),
      false,
    );
  });

  it("keeps upstream discovery visible but non-executable", () => {
    const discovered = normalizeUpstream({
      id: "vendor/new-model",
      pricing: { prompt: "0.000001", completion: "0.000002" },
    });
    assert.equal(discovered.free, false);
    assert.equal(discovered.endpoints[0].pricingVerified, false);
    assert.equal(isExecutableEndpoint(discovered.endpoints[0]), false);
  });

  it("never routes bundled reference pricing while curated pricing still routes", () => {
    const reference = allModels().find(
      (model) => model.verified !== true && model.endpoints.length > 0,
    );
    assert.ok(reference, "expected at least one discovery-only catalog entry");
    assert.equal(reference.free, false);
    assert.equal(
      resolveRoute(
        { model: reference.id, messages: [{ role: "user", content: "hello" }] },
        auth,
      ).models.length,
      0,
    );

    const curated = resolveRoute(
      { model: "openai/gpt-4o", messages: [{ role: "user", content: "hello" }] },
      auth,
    );
    assert.ok(curated.models.length > 0);
    assert.ok(curated.models.every((model) => model.endpoints.every(isExecutableEndpoint)));
    assert.deepEqual(
      curated.models[0].endpoints.map((item) => item.adapter),
      ["openai"],
      "an alternate host cannot inherit the canonical host tariff",
    );
  });

  it("routes only the explicitly free host for a mixed free/unknown model", () => {
    const plan = resolveRoute(
      {
        model: "meta-llama/llama-3.1-8b-instruct:free",
        messages: [{ role: "user", content: "hello" }],
      },
      auth,
    );
    assert.equal(plan.models.length, 1);
    assert.deepEqual(plan.models[0].endpoints.map((item) => item.adapter), ["groq"]);
    assert.ok(plan.models[0].endpoints.every(isFreeEndpoint));
  });

  it("does not send media-only models through the text gateway", () => {
    const plan = resolveRoute(
      {
        model: "openai/tts-1",
        messages: [{ role: "user", content: "this is not a speech request" }],
      },
      auth,
    );
    assert.equal(plan.models.length, 0);
  });

  it("keeps discovery-only Nexus slugs out of Chat and Arena", () => {
    const catalog = allModels();
    const builtin = catalog.filter(
      (model) => isTextModelExecutionReady(model) && model.id.startsWith("nexus/"),
    );
    assert.deepEqual(builtin.map((model) => model.id), ["nexus/auto", "nexus/free"]);
    const experimental = catalog.find((model) => model.id === "nexus/auto-beta");
    assert.ok(experimental, "expected the discovery-only Nexus reference slug");
    assert.equal(isTextModelExecutionReady(experimental), false);
  });

  it("lists only executable models by default and makes references opt-in", async () => {
    const publicResponse = await listModels(new Request("https://nexus.test/api/v1/models"));
    const publicBody = (await publicResponse.json()) as {
      data: Array<{ id: string; nexus: { executable: boolean; reference_only: boolean } }>;
    };
    assert.ok(publicBody.data.length > 0);
    assert.ok(
      publicBody.data.every(
        (model) =>
          model.id === "nexus/auto" || model.id === "nexus/free" || model.nexus.executable,
      ),
    );

    const fullResponse = await listModels(
      new Request("https://nexus.test/api/v1/models?include_reference=true"),
    );
    const fullBody = (await fullResponse.json()) as typeof publicBody;
    assert.ok(fullBody.data.length > publicBody.data.length);
    assert.ok(fullBody.data.some((model) => model.nexus.reference_only));
  });
});
