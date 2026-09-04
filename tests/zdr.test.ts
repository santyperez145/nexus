import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertZdrCompatible,
  canUseByokForRequest,
  isZdrRequest,
  validateChatRequest,
  normalizeMessages,
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
  it("normalizes modern developer and legacy function messages without losing call identity", () => {
    const messages = normalizeMessages({
      messages: [
        { role: "developer", content: "Follow policy" },
        {
          role: "assistant",
          content: "",
          function_call: { name: "lookup", arguments: '{"id":1}' },
        },
        { role: "function", name: "lookup", content: '{"ok":true}' },
      ],
    });
    assert.equal(messages[0]?.role, "system");
    assert.equal(messages[1]?.role, "assistant");
    assert.equal(messages[2]?.role, "tool");
    assert.equal(messages[2]?.tool_call_id, "legacy_function_1");
    assert.deepEqual(messages[1]?.tool_calls, [
      {
        id: "legacy_function_1",
        type: "function",
        function: { name: "lookup", arguments: '{"id":1}' },
      },
    ]);
  });

  it("rejects unknown Chat message roles", () => {
    assert.throws(
      () => normalizeMessages({ messages: [{ role: "owner" as "user", content: "x" }] }),
      (error: Error & { code?: string }) => error.code === "invalid_request",
    );
  });

  it("rejects malformed or role-incompatible content parts", () => {
    assert.throws(
      () =>
        normalizeMessages({
          messages: [
            {
              role: "developer",
              content: [{ type: "image_url", image_url: "https://example.com/policy.png" }],
            },
          ],
        }),
      (error: Error & { code?: string }) => error.code === "invalid_request",
    );
  });

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
