import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  chatChunkPayload,
  chatCompletionPayload,
  toAnthropicMessage,
  toResponseEnvelope,
  usagePayload,
  reshapeChatResponse,
} from "../src/lib/gateway/openai-compat";
import { localEchoText } from "../src/lib/gateway/providers";

function upstreamStream(chunks: unknown[], lineBreak = "\n") {
  const separator = `${lineBreak}${lineBreak}`;
  return new Response(
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}${separator}`).join("") + `data: [DONE]${separator}`,
    { headers: { "content-type": "text/event-stream", "x-request-id": "req-1" } },
  );
}

function sseEvents(value: string) {
  return value
    .split(/\r?\n\r?\n/)
    .filter(Boolean)
    .map((block) => {
      const event = block.split(/\r?\n/).find((line) => line.startsWith("event: "))?.slice(7);
      const data = block.split(/\r?\n/).find((line) => line.startsWith("data: "))?.slice(6);
      return { event, data: data ? JSON.parse(data) as Record<string, unknown> : null };
    });
}

describe("openai-compat", () => {
  it("preserves block input in the local guest echo used by official SDKs", () => {
    assert.equal(
      localEchoText([{ role: "user", content: [{ type: "text", text: "sdk input" }] }]),
      "sdk input",
    );
  });

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

  it("normalizes AI SDK tool calls for all protocol envelopes", () => {
    const chat = chatCompletionPayload({
      id: "gen-tools",
      model: "nexus/auto",
      provider: "openai",
      text: "",
      finishReason: "tool-calls",
      promptTokens: 2,
      completionTokens: 1,
      costUsd: 0.001,
      isByok: false,
      pricing: { prompt: 0, completion: 0 },
      toolCalls: [{ toolCallId: "call_weather", toolName: "weather", input: { city: "BA" } }],
    });
    assert.equal(chat.choices[0]?.finish_reason, "tool_calls");
    const tool = chat.choices[0]?.message.tool_calls?.[0];
    assert.equal(tool?.function.name, "weather");
    assert.equal(tool?.function.arguments, '{"city":"BA"}');
    const response = toResponseEnvelope(chat);
    assert.equal(response.status, "completed");
    assert.equal(response.incomplete_details, null);
    const functionCall = response.output.find((item) => item.type === "function_call");
    assert.equal(functionCall && "call_id" in functionCall ? functionCall.call_id : "", "call_weather");
    const anthropic = toAnthropicMessage(chat);
    const toolUse = anthropic.content.find((block) => block.type === "tool_use");
    assert.deepEqual(toolUse && "input" in toolUse ? toolUse.input : null, { city: "BA" });
  });

  it("marks token-limited Responses as incomplete", () => {
    const chat = chatCompletionPayload({
      id: "gen-limited",
      model: "nexus/auto",
      provider: "local",
      text: "partial",
      finishReason: "length",
      promptTokens: 2,
      completionTokens: 3,
      costUsd: 0,
      isByok: false,
      pricing: { prompt: 0, completion: 0 },
    });
    const response = toResponseEnvelope(chat);
    assert.equal(response.status, "incomplete");
    assert.deepEqual(response.incomplete_details, { reason: "max_output_tokens" });
    const message = response.output.find((item) => item.type === "message");
    assert.equal(message?.status, "incomplete");
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

  it("emits a complete Responses text lifecycle with cumulative final output", async () => {
    const usage = usagePayload({
      promptTokens: 4,
      completionTokens: 2,
      costUsd: 0.0001,
      isByok: false,
      pricing: { prompt: 0, completion: 0 },
    });
    const chunks = [
      chatChunkPayload({
        id: "gen-stream",
        model: "nexus/auto",
        provider: "local",
        delta: { role: "assistant", content: "hola " },
        finishReason: null,
      }),
      chatChunkPayload({
        id: "gen-stream",
        model: "nexus/auto",
        provider: "local",
        delta: { content: "mundo" },
        finishReason: null,
      }),
      chatChunkPayload({
        id: "gen-stream",
        model: "nexus/auto",
        provider: "local",
        delta: { content: "" },
        finishReason: "stop",
        usage,
      }),
    ];
    const response = await reshapeChatResponse(upstreamStream(chunks, "\r\n"), "response");
    const events = sseEvents(await response.text());
    assert.deepEqual(events.map((entry) => entry.event), [
      "response.created",
      "response.in_progress",
      "response.output_item.added",
      "response.content_part.added",
      "response.output_text.delta",
      "response.output_text.delta",
      "response.output_text.done",
      "response.content_part.done",
      "response.output_item.done",
      "response.completed",
    ]);
    const sequence = events.map((entry) => entry.data?.sequence_number);
    assert.deepEqual(sequence, sequence.map((_, index) => index));
    const completed = events.at(-1)?.data?.response as {
      output: Array<{ content: Array<{ text: string }> }>;
      usage: { total_tokens: number };
    };
    assert.equal(completed.output[0]?.content[0]?.text, "hola mundo");
    assert.equal(completed.usage.total_tokens, 6);
    assert.equal(response.headers.get("x-request-id"), "req-1");
  });

  it("streams function calls in Responses and Anthropic wire formats", async () => {
    const toolDelta = chatChunkPayload({
      id: "gen-tools-stream",
      model: "nexus/auto",
      provider: "openai",
      delta: {
        tool_calls: [{ toolCallId: "call_weather", toolName: "weather", input: { city: "BA" } }],
      },
      finishReason: null,
    });
    const done = chatChunkPayload({
      id: "gen-tools-stream",
      model: "nexus/auto",
      provider: "openai",
      delta: {},
      finishReason: "tool-calls",
    });

    const responseStream = await reshapeChatResponse(upstreamStream([toolDelta, done]), "response");
    const responseEvents = sseEvents(await responseStream.text());
    assert.ok(responseEvents.some((entry) => entry.event === "response.function_call_arguments.delta"));
    const completed = responseEvents.at(-1)?.data?.response as {
      status: string;
      output: Array<{ type: string; call_id: string; arguments: string }>;
    };
    assert.equal(completed.status, "completed");
    assert.equal(completed.output[0]?.type, "function_call");
    assert.equal(completed.output[0]?.call_id, "call_weather");
    assert.equal(completed.output[0]?.arguments, '{"city":"BA"}');

    const anthropicStream = await reshapeChatResponse(upstreamStream([toolDelta, done]), "anthropic");
    const anthropicEvents = sseEvents(await anthropicStream.text());
    assert.deepEqual(anthropicEvents.map((entry) => entry.event), [
      "message_start",
      "content_block_start",
      "content_block_delta",
      "content_block_stop",
      "message_delta",
      "message_stop",
    ]);
    const start = anthropicEvents[1]?.data?.content_block as { type: string; name: string };
    const delta = anthropicEvents[2]?.data?.delta as { type: string; partial_json: string };
    assert.deepEqual(start, { type: "tool_use", id: "call_weather", name: "weather", input: {} });
    assert.equal(delta.type, "input_json_delta");
    assert.equal(delta.partial_json, '{"city":"BA"}');
    assert.equal((anthropicEvents[4]?.data?.delta as { stop_reason: string }).stop_reason, "tool_use");
  });

  it("fails closed with a protocol-native event for malformed upstream SSE", async () => {
    const response = await reshapeChatResponse(
      new Response("data: {not-json}\n\n", { headers: { "content-type": "text/event-stream" } }),
      "response",
    );
    const events = sseEvents(await response.text());
    assert.equal(events[0]?.event, "error");
    assert.equal(events[0]?.data?.code, "invalid_stream_event");
  });
});
