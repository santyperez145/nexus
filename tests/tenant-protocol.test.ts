import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canAccess } from "../src/lib/gateway/tenant";
import { chatChunkPayload, chatChunkToProtocolSse } from "../src/lib/gateway/openai-compat";
import { mapToolChoice } from "../src/lib/gateway/client-tools";
import { hubTenantAccess } from "../src/lib/hub/datasets";

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

  it("allows a shared row inside the key-scoped workspace", () => {
    assert.equal(canAccess(authWs, { userId: "u2", workspaceId: "ws_a" }), true);
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

  it("session identity sees assigned shared workspaces but not unassigned tenants", () => {
    const sessionIdentity = { userId: "u1", workspaceIds: ["ws_shared"] };
    assert.equal(
      canAccess(sessionIdentity, { userId: "owner", workspaceId: "ws_shared" }),
      true,
    );
    assert.equal(
      canAccess(sessionIdentity, { userId: "owner", workspaceId: "ws_private" }),
      false,
    );
  });

  it("keeps Hub ownership subordinate to the active tenant", () => {
    assert.equal(
      hubTenantAccess(
        { userId: "creator", workspaceIds: [] },
        { userId: "creator", workspaceId: "ws_removed" },
      ),
      false,
    );
    assert.equal(
      hubTenantAccess(
        { userId: "member", workspaceIds: ["ws_shared"] },
        { userId: "creator", workspaceId: "ws_shared" },
      ),
      true,
    );
    assert.equal(
      hubTenantAccess(
        { userId: "creator", workspaceId: "ws_shared", workspaceIds: ["ws_shared"] },
        { userId: "creator", workspaceId: null },
      ),
      false,
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
