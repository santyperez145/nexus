import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyGuardrailRoutingPolicy,
  isGuardrailApplicable,
} from "../src/lib/gateway/guardrails";
import type { AuthContext, ChatRequest } from "../src/lib/gateway/types";

const auth: AuthContext = {
  userId: "member",
  workspaceId: "ws_shared",
  workspaceIds: ["ws_shared"],
  isManagement: false,
  creditMicros: 1_000_000,
  zdr: false,
  allowTraining: true,
  logPrompts: false,
};

describe("guardrail hierarchy", () => {
  it("applies account rules together with the active workspace and excludes other workspaces", () => {
    assert.equal(isGuardrailApplicable(auth, { userId: "member", workspaceId: null }), true);
    assert.equal(isGuardrailApplicable(auth, { userId: "owner", workspaceId: "ws_shared" }), true);
    assert.equal(isGuardrailApplicable(auth, { userId: "member", workspaceId: "ws_other" }), false);
    assert.equal(isGuardrailApplicable({ ...auth, workspaceId: null }, { userId: "member", workspaceId: "ws_shared" }), false);
  });

  it("intersects provider policies and makes ZDR mandatory", () => {
    const request: ChatRequest = { model: "openai/gpt-5", provider: { only: ["openai", "groq"] } };
    applyGuardrailRoutingPolicy(request, [
      { userId: "member", workspaceId: null, allowedProviders: ["openai", "groq"], enforceZdr: false },
      { userId: "owner", workspaceId: "ws_shared", allowedProviders: ["openai"], enforceZdr: true },
    ]);
    assert.deepEqual(request.provider?.only, ["openai"]);
    assert.equal(request.provider?.zdr, true);
    assert.equal(request.provider?.data_collection, "deny");
  });

  it("fails closed when request and guardrails leave no common provider", () => {
    const request: ChatRequest = { model: "openai/gpt-5", provider: { only: ["groq"] } };
    assert.throws(
      () => applyGuardrailRoutingPolicy(request, [
        { userId: "member", workspaceId: null, allowedProviders: ["openai"], enforceZdr: false },
      ]),
      (error: unknown) => (error as { status?: number; code?: string }).status === 403 && (error as { code?: string }).code === "guardrail_blocked",
    );
  });
});
