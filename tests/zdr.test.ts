import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertZdrCompatible,
  canUseByokForRequest,
  isZdrRequest,
  validateChatRequest,
} from "../src/lib/gateway/handle-chat";
import type { AuthContext, ChatRequest } from "../src/lib/gateway/types";

const auth: AuthContext = {
  userId: "u_zdr",
  isManagement: false,
  creditMicros: 1_000_000,
  zdr: true,
  allowTraining: false,
  logPrompts: true,
};

describe("ZDR fail-closed contract", () => {
  it("recognizes account and request-level ZDR", () => {
    assert.equal(isZdrRequest({ model: "nexus/auto" }, auth), true);
    assert.equal(
      isZdrRequest(
        { model: "nexus/auto", provider: { data_collection: "deny" } },
        { ...auth, zdr: false },
      ),
      true,
    );
  });

  it("rejects provider features that retain request data", () => {
    for (const request of [
      { store: true },
      { background: true },
      { prompt_cache_retention: "24h" },
    ] as ChatRequest[]) {
      assert.throws(
        () => assertZdrCompatible({ model: "nexus/auto", ...request }, auth),
        (error: Error & { code?: string }) => error.code === "zdr_incompatible",
      );
    }
  });

  it("never assumes platform privacy contracts apply to BYOK credentials", () => {
    assert.equal(canUseByokForRequest({ provider: { zdr: true } }, auth), false);
    assert.equal(canUseByokForRequest({}, { ...auth, zdr: false, allowTraining: false }), false);
    assert.equal(canUseByokForRequest({}, { ...auth, zdr: false, allowTraining: true }), true);
  });
});

describe("gateway request bounds", () => {
  it("rejects unbounded output and tool schemas before provider execution", () => {
    const messages = [{ role: "user" as const, content: "hello" }];
    assert.throws(
      () => validateChatRequest({ max_tokens: 131_073 }, messages),
      /max_tokens/,
    );
    assert.throws(
      () => validateChatRequest({ tools: Array.from({ length: 129 }, () => ({})) }, messages),
      /Tool definitions/,
    );
  });
});
