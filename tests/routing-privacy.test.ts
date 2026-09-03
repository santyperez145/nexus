import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveRoute } from "../src/lib/gateway/router";
import type { AuthContext } from "../src/lib/gateway/types";
import { isEndpointNoTrainingConfirmed, isEndpointZdrConfirmed } from "../src/lib/providers/privacy";

const auth = (over: Partial<AuthContext> = {}): AuthContext => ({
  userId: "u1",
  apiKeyId: undefined,
  workspaceId: null,
  isManagement: false,
  creditMicros: 1_000_000,
  zdr: false,
  allowTraining: false,
  logPrompts: false,
  ...over,
});

describe("routing privacy", () => {
  it("fails closed when no provider has a confirmed no-training agreement", () => {
    const previous = process.env.NO_TRAINING_PROVIDER_IDS;
    delete process.env.NO_TRAINING_PROVIDER_IDS;
    try {
      const plan = resolveRoute(
        { model: "openai/gpt-4o", messages: [{ role: "user", content: "hola mundo" }] },
        auth({ allowTraining: false }),
      );
      assert.equal(plan.models.length, 0);
    } finally {
      if (previous == null) delete process.env.NO_TRAINING_PROVIDER_IDS;
      else process.env.NO_TRAINING_PROVIDER_IDS = previous;
    }
  });

  it("routes only through explicitly confirmed no-training providers", () => {
    const previous = process.env.NO_TRAINING_PROVIDER_IDS;
    process.env.NO_TRAINING_PROVIDER_IDS = "openai";
    try {
      const plan = resolveRoute(
        { model: "openai/gpt-4o", messages: [{ role: "user", content: "hola mundo" }] },
        auth({ allowTraining: false }),
      );
      assert.ok(plan.models.length > 0);
      assert.ok(plan.models.every((m) => m.endpoints.every(isEndpointNoTrainingConfirmed)));
    } finally {
      if (previous == null) delete process.env.NO_TRAINING_PROVIDER_IDS;
      else process.env.NO_TRAINING_PROVIDER_IDS = previous;
    }
  });

  it("hard-filters ZDR to providers with a confirmed active agreement", () => {
    const previous = process.env.ZDR_PROVIDER_IDS;
    process.env.ZDR_PROVIDER_IDS = "openai";
    try {
      const plan = resolveRoute(
        { model: "openai/gpt-4o", messages: [{ role: "user", content: "hola" }] },
        auth({ zdr: true, allowTraining: true }),
      );
      assert.ok(plan.models.length > 0);
      assert.ok(plan.models.every((m) => m.endpoints.every(isEndpointZdrConfirmed)));
    } finally {
      if (previous == null) delete process.env.ZDR_PROVIDER_IDS;
      else process.env.ZDR_PROVIDER_IDS = previous;
    }
  });
});
