import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findModel } from "../src/lib/catalog";
import {
  normalizeEmbeddingModelId,
  resolveEmbeddingRoute,
  validateEmbeddingResult,
} from "../src/lib/gateway/embedding-routing";
import { endpointMediaPrivacyAllowed } from "../src/lib/gateway/media-privacy";
import type { AuthContext } from "../src/lib/gateway/types";

const auth: AuthContext = {
  userId: "embedding-user",
  isManagement: false,
  scopes: ["inference:write"],
  plan: "pro",
  creditMicros: 10_000_000,
  zdr: false,
  allowTraining: true,
  logPrompts: false,
};

function routedEmbeddingModel() {
  const source = findModel("openai/text-embedding-3-small")!;
  const endpoint = source.endpoints[0];
  return {
    ...source,
    id: "vectors/semantic-1",
    author: "vectors",
    canonicalSlug: "vectors/semantic-1",
    endpoints: [
      {
        ...endpoint,
        name: "expensive",
        adapter: "expensive",
        providerConnectionId: "pconn_expensive",
        providerOfferingId: "poff_expensive",
        pricing: { prompt: 0.000002, completion: 0 },
        zdr: false,
        zdrVerified: false,
        noTrainingVerified: false,
      },
      {
        ...endpoint,
        name: "private-cheap",
        adapter: "private-cheap",
        providerConnectionId: "pconn_private",
        providerOfferingId: "poff_private",
        pricing: { prompt: 0.000001, completion: 0 },
        zdr: true,
        zdrVerified: true,
        noTrainingVerified: true,
      },
    ],
  };
}

describe("multi-provider embedding routing", () => {
  it("preserves OpenAI-compatible defaults and unprefixed model ids", () => {
    assert.equal(normalizeEmbeddingModelId(undefined), "openai/text-embedding-3-small");
    assert.equal(
      normalizeEmbeddingModelId("text-embedding-3-large"),
      "openai/text-embedding-3-large",
    );
  });

  it("sorts verified embedding endpoints by price and honors provider filters", () => {
    const model = routedEmbeddingModel();
    const route = resolveEmbeddingRoute({ model: model.id, catalog: [model], auth });
    assert.deepEqual(route.endpoints.map((endpoint) => endpoint.adapter), [
      "private-cheap",
      "expensive",
    ]);
    const pinned = resolveEmbeddingRoute({
      model: model.id,
      catalog: [model],
      auth,
      provider: { only: ["expensive"] },
    });
    assert.deepEqual(pinned.endpoints.map((endpoint) => endpoint.adapter), ["expensive"]);
    const ordered = resolveEmbeddingRoute({
      model: model.id,
      catalog: [model],
      auth,
      provider: { order: ["expensive"], allow_fallbacks: true },
    });
    assert.deepEqual(ordered.endpoints.map((endpoint) => endpoint.adapter), [
      "expensive",
      "private-cheap",
    ]);
    const noFallback = resolveEmbeddingRoute({
      model: model.id,
      catalog: [model],
      auth,
      provider: { allow_fallbacks: false },
    });
    assert.deepEqual(noFallback.endpoints.map((endpoint) => endpoint.adapter), ["private-cheap"]);
  });

  it("keeps strict privacy on verified platform contracts and rejects BYOK", () => {
    const model = routedEmbeddingModel();
    const strictAuth = { ...auth, zdr: true, allowTraining: false };
    const route = resolveEmbeddingRoute({ model: model.id, catalog: [model], auth: strictAuth });
    assert.deepEqual(route.endpoints.map((endpoint) => endpoint.adapter), ["private-cheap"]);
    assert.equal(endpointMediaPrivacyAllowed(strictAuth, route.endpoints[0], false), true);
    assert.equal(endpointMediaPrivacyAllowed(strictAuth, route.endpoints[0], true), false);
  });

  it("never routes a text-generation model through embeddings", () => {
    const text = findModel("openai/gpt-4o-mini")!;
    assert.throws(
      () => resolveEmbeddingRoute({ model: text.id, catalog: [text], auth }),
      /unsupported embedding model/,
    );
  });

  it("rejects malformed vectors and impossible usage before billing", () => {
    assert.deepEqual(
      validateEmbeddingResult({
        embeddings: [[0.1, 0.2], [0.3, 0.4]],
        expectedCount: 2,
        requestedDimensions: 2,
        reportedTokens: 4,
        reservationTokens: 12,
      }),
      { dimensions: 2, promptTokens: 4 },
    );
    assert.throws(
      () => validateEmbeddingResult({
        embeddings: [[0.1], [Number.NaN]],
        expectedCount: 2,
        reportedTokens: 4,
        reservationTokens: 12,
      }),
      /invalid vector dimensions/,
    );
    assert.throws(
      () => validateEmbeddingResult({
        embeddings: [[0.1, 0.2]],
        expectedCount: 1,
        reportedTokens: 100,
        reservationTokens: 4,
      }),
      /invalid token usage/,
    );
  });
});
