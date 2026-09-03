import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveRoute } from "../src/lib/gateway/router";
import type { AuthContext } from "../src/lib/gateway/types";

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
  it("does not empty nexus/auto when allowTraining is false", () => {
    const plan = resolveRoute(
      { model: "nexus/auto", messages: [{ role: "user", content: "hola mundo" }] },
      auth({ allowTraining: false }),
    );
    assert.ok(plan.models.length > 0, "expected at least one routed model");
    assert.ok(plan.models.every((m) => m.endpoints.length > 0));
  });

  it("hard-filters to ZDR when zdr flag is on", () => {
    const plan = resolveRoute(
      { model: "openai/gpt-4o", messages: [{ role: "user", content: "hola" }] },
      auth({ zdr: true, allowTraining: true }),
    );
    for (const m of plan.models) {
      assert.ok(m.endpoints.every((e) => e.zdr));
    }
  });
});
