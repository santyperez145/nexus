import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canAccess } from "../src/lib/gateway/tenant";
import { chatChunkPayload, chatChunkToProtocolSse } from "../src/lib/gateway/openai-compat";
import { mapToolChoice } from "../src/lib/gateway/client-tools";

describe("tenant isolation", () => {
  const authWs = {
    userId: "u1",
    workspaceId: "ws_a",
    isManagement: false,
    creditMicros: 0,
    zdr: false,
    allowTraining: true,
    logPrompts: false,
  };

  it("denies another user's row", () => {
    assert.equal(canAccess(authWs, { userId: "u2", workspaceId: "ws_a" }), false);
  });

  it("denies same user in another workspace", () => {
    assert.equal(canAccess(authWs, { userId: "u1", workspaceId: "ws_b" }), false);
  });

  it("allows matching workspace", () => {
    assert.equal(canAccess(authWs, { userId: "u1", workspaceId: "ws_a" }), true);
  });

  it("session without workspace sees all user rows", () => {
    assert.equal(
      canAccess({ ...authWs, workspaceId: undefined }, { userId: "u1", workspaceId: "ws_b" }),
      true,
    );
  });
});

describe("protocol streaming", () => {
  it("emits Responses output_text.delta events", () => {
    const chunk = chatChunkPayload({
      id: "gen-1",
      model: "m",
      delta: { content: "hola" },
      finishReason: null,
    });
    const sse = chatChunkToProtocolSse(chunk, "response");
    assert.ok(sse.includes("response.output_text.delta"));
    assert.ok(sse.includes("hola"));
  });

  it("emits Anthropic content_block_delta events", () => {
    const chunk = chatChunkPayload({
      id: "gen-1",
      model: "m",
      delta: { content: "hola" },
      finishReason: null,
    });
    const sse = chatChunkToProtocolSse(chunk, "anthropic");
    assert.ok(sse.includes("content_block_delta"));
    assert.ok(sse.includes("text_delta"));
  });
});

describe("tool_choice mapping", () => {
  it("maps function name to AI SDK tool choice", () => {
    const mapped = mapToolChoice({ type: "function", function: { name: "search" } });
    assert.deepEqual(mapped, { type: "tool", toolName: "search" });
  });
});
