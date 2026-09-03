import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyMiddleOut } from "../src/lib/gateway/middle-out";
import type { ChatMessage } from "../src/lib/gateway/types";

describe("middle-out", () => {
  it("keeps short threads intact", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "hola" },
    ];
    assert.equal(applyMiddleOut(messages, 100).length, 2);
  });

  it("drops the middle of a long thread", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "a".repeat(80) },
      ...Array.from({ length: 12 }, (_, i) => ({
        role: (i % 2 ? "assistant" : "user") as ChatMessage["role"],
        content: `turn-${i}-${"x".repeat(40)}`,
      })),
    ];
    const out = applyMiddleOut(messages, 200);
    assert.equal(out[0]?.role, "system");
    assert.ok(out.some((m) => String(m.content).includes("middle-out")));
    assert.ok(out.length < messages.length);
  });
});
