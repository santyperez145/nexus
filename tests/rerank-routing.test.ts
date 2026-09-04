import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findModel } from "../src/lib/catalog";
import { endpointMediaPrivacyAllowed } from "../src/lib/gateway/media-privacy";
import { rerankProviderPayload } from "../src/lib/gateway/providers";
import {
  resolveRerankRoute,
  validateRerankResult,
} from "../src/lib/gateway/rerank-routing";
import type { AuthContext } from "../src/lib/gateway/types";

const auth: AuthContext = {
  userId: "rerank-user",
  isManagement: false,
  scopes: ["inference:write"],
  plan: "pro",
  creditMicros: 10_000_000,
  zdr: false,
  allowTraining: true,
  logPrompts: false,
};

function routedRerankModel() {
  const source = findModel("nexus/rerank-quality")!;
  const endpoint = source.endpoints[0];
  return {
    ...source,
    id: "search/rerank-1",
    author: "search",
    canonicalSlug: "search/rerank-1",
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

describe("multi-provider rerank routing", () => {
  it("sorts verified endpoints and honors provider policy", () => {
    const model = routedRerankModel();
    const route = resolveRerankRoute({ model: model.id, catalog: [model], auth });
    assert.deepEqual(route.endpoints.map((endpoint) => endpoint.adapter), [
      "private-cheap",
      "expensive",
    ]);
    const ordered = resolveRerankRoute({
      model: model.id,
      catalog: [model],
      auth,
      provider: { order: ["expensive"], allow_fallbacks: true },
    });
    assert.deepEqual(ordered.endpoints.map((endpoint) => endpoint.adapter), [
      "expensive",
      "private-cheap",
    ]);
    const pinned = resolveRerankRoute({
      model: model.id,
      catalog: [model],
      auth,
      provider: { only: ["expensive"], allow_fallbacks: false },
    });
    assert.deepEqual(pinned.endpoints.map((endpoint) => endpoint.adapter), ["expensive"]);
  });

  it("keeps strict privacy fail-closed and rejects unrelated model modalities", () => {
    const model = routedRerankModel();
    const strictAuth = { ...auth, zdr: true, allowTraining: false };
    const route = resolveRerankRoute({ model: model.id, catalog: [model], auth: strictAuth });
    assert.deepEqual(route.endpoints.map((endpoint) => endpoint.adapter), ["private-cheap"]);
    assert.equal(endpointMediaPrivacyAllowed(strictAuth, route.endpoints[0], false), true);
    assert.equal(endpointMediaPrivacyAllowed(strictAuth, route.endpoints[0], true), false);

    for (const id of ["openai/gpt-4o-mini", "openai/text-embedding-3-small"]) {
      const unrelated = findModel(id)!;
      assert.throws(
        () => resolveRerankRoute({ model: unrelated.id, catalog: [unrelated], auth }),
        /unsupported rerank model/,
      );
    }
  });

  it("maps the public contract to native and OpenAI-compatible provider payloads", () => {
    const common = {
      model: "rerank-2.5-lite",
      query: "capital de Francia",
      documents: ["París", "Madrid"],
      topN: 1,
      truncation: true,
    };
    assert.deepEqual(rerankProviderPayload({ adapter: "voyage", ...common }), {
      model: "rerank-2.5-lite",
      query: "capital de Francia",
      documents: ["París", "Madrid"],
      return_documents: false,
      truncation: true,
      top_k: 1,
    });
    assert.deepEqual(rerankProviderPayload({ adapter: "managed-rerank", ...common }), {
      model: "rerank-2.5-lite",
      query: "capital de Francia",
      documents: ["París", "Madrid"],
      return_documents: false,
      truncation: true,
      top_n: 1,
    });
  });

  it("normalizes valid rankings and rejects poisoned provider accounting", () => {
    assert.deepEqual(
      validateRerankResult({
        results: [
          { index: 0, relevance_score: 0.4 },
          { index: 2, relevance_score: 0.9 },
        ],
        documentCount: 3,
        maxResults: 2,
        reportedTokens: 24,
        reservationTokens: 100,
      }),
      {
        results: [
          { index: 2, relevance_score: 0.9 },
          { index: 0, relevance_score: 0.4 },
        ],
        promptTokens: 24,
      },
    );
    const base = {
      documentCount: 3,
      maxResults: 2,
      reportedTokens: 24,
      reservationTokens: 100,
    };
    assert.throws(
      () => validateRerankResult({ ...base, results: [{ index: 4, relevance_score: 0.8 }] }),
      /invalid indices or scores/,
    );
    assert.throws(
      () => validateRerankResult({
        ...base,
        results: [
          { index: 1, relevance_score: 0.8 },
          { index: 1, relevance_score: 0.7 },
        ],
      }),
      /invalid indices or scores/,
    );
    assert.throws(
      () => validateRerankResult({ ...base, results: [{ index: 0, relevance_score: Number.NaN }] }),
      /invalid indices or scores/,
    );
    assert.throws(
      () => validateRerankResult({ ...base, results: [{ index: 0, relevance_score: 0.8 }], reportedTokens: 10_000 }),
      /invalid token usage/,
    );
    assert.throws(
      () => validateRerankResult({ ...base, results: [{ index: 0, relevance_score: 0.8 }], reportedTokens: undefined }),
      /invalid token usage/,
    );
  });
});
