import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  chatChunkPayload,
  chatCompletionPayload,
  toAnthropicMessage,
  toResponseEnvelope,
  usagePayload,
} from "../src/lib/gateway/openai-compat";

describe("openai-compat", () => {
  it("builds OpenRouter-shaped usage", () => {
    const usage = usagePayload({
      promptTokens: 10,
      completionTokens: 5,
      costUsd: 0.001,
      isByok: false,
      pricing: { prompt: 0.000001, completion: 0.000002 },
      reasoningTokens: 2,
      cachedTokens: 3,
    });
    assert.equal(usage.prompt_tokens, 10);
    assert.equal(usage.completion_tokens, 5);
    assert.equal(usage.total_tokens, 15);
    assert.equal(usage.cost, 0.001);
    assert.equal(usage.is_byok, false);
    assert.equal(usage.prompt_tokens_details.cached_tokens, 3);
    assert.equal(usage.completion_tokens_details.reasoning_tokens, 2);
  });

  it("includes provider and optional tool_calls", () => {
    const payload = chatCompletionPayload({
      id: "gen-1",
      model: "nexus/auto",
      provider: "groq",
      text: "hola",
      finishReason: "stop",
      promptTokens: 1,
      completionTokens: 1,
      costUsd: 0,
      isByok: false,
      pricing: { prompt: 0, completion: 0 },
      toolCalls: [{ id: "call_1", type: "function" }],
    });
    assert.equal(payload.object, "chat.completion");
    assert.equal(payload.provider, "groq");
    assert.equal(payload.choices[0]?.message.content, "hola");
    assert.ok(payload.choices[0] && "tool_calls" in payload.choices[0].message);
  });

  it("omits usage on chunks unless provided", () => {
    const chunk = chatChunkPayload({
      id: "gen-1",
      model: "m",
      provider: "local",
      delta: { content: "x" },
      finishReason: null,
    });
    assert.equal(chunk.object, "chat.completion.chunk");
    assert.equal("usage" in chunk, false);
  });

  it("maps chat.completion to Responses envelope", () => {
    const chat = chatCompletionPayload({
      id: "gen-abc",
      model: "nexus/auto",
      provider: "local",
      text: "hola mundo",
      finishReason: "stop",
      promptTokens: 2,
      completionTokens: 3,
      costUsd: 0,
      isByok: false,
      pricing: { prompt: 0, completion: 0 },
    });
    const resp = toResponseEnvelope(chat);
    assert.equal(resp.object, "response");
    assert.equal(resp.status, "completed");
    const textOut = resp.output.find((o) => o.type === "message");
    assert.equal(textOut && "content" in textOut ? textOut.content[0]?.text : "", "hola mundo");
    assert.equal(resp.usage.input_tokens, 2);
    assert.equal(resp.metadata.nexus_chat_id, "gen-abc");
  });

  it("maps chat.completion to Anthropic Messages envelope", () => {
    const chat = chatCompletionPayload({
      id: "gen-xyz",
      model: "anthropic/claude",
      provider: "local",
      text: "bonjour",
      finishReason: "stop",
      promptTokens: 1,
      completionTokens: 1,
      costUsd: 0,
      isByok: false,
      pricing: { prompt: 0, completion: 0 },
    });
    const msg = toAnthropicMessage(chat);
    assert.equal(msg.type, "message");
    assert.equal(msg.role, "assistant");
    const textBlock = msg.content.find((b) => b.type === "text");
    assert.equal(textBlock && "text" in textBlock ? textBlock.text : "", "bonjour");
    assert.equal(msg.stop_reason, "end_turn");
  });
});
