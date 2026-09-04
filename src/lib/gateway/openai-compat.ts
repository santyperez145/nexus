export type CompletionUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost: number;
  is_byok: boolean;
  prompt_tokens_details: { cached_tokens: number; audio_tokens: number };
  completion_tokens_details: { reasoning_tokens: number };
  cost_details: {
    upstream_inference_prompt_cost: number;
    upstream_inference_completions_cost: number;
  };
};

type CanonicalToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export function canonicalToolCall(raw: unknown, index: number): CanonicalToolCall {
  const call = (raw ?? {}) as {
    id?: string;
    toolCallId?: string;
    name?: string;
    toolName?: string;
    input?: unknown;
    arguments?: unknown;
    function?: { name?: string; arguments?: string };
  };
  const args = call.function?.arguments ?? call.arguments ?? call.input ?? {};
  return {
    id: call.id ?? call.toolCallId ?? `call_${index}`,
    type: "function",
    function: {
      name: call.function?.name ?? call.toolName ?? call.name ?? "tool",
      arguments: typeof args === "string" ? args : JSON.stringify(args),
    },
  };
}

function canonicalFinishReason(reason: string) {
  return reason === "tool-calls" || reason === "tool_use" ? "tool_calls" : reason;
}

export function usagePayload(opts: {
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  isByok: boolean;
  pricing: { prompt: number; completion: number };
  reasoningTokens?: number;
  cachedTokens?: number;
}): CompletionUsage {
  return {
    prompt_tokens: opts.promptTokens,
    completion_tokens: opts.completionTokens,
    total_tokens: opts.promptTokens + opts.completionTokens,
    cost: opts.costUsd,
    is_byok: opts.isByok,
    prompt_tokens_details: { cached_tokens: opts.cachedTokens ?? 0, audio_tokens: 0 },
    completion_tokens_details: { reasoning_tokens: opts.reasoningTokens ?? 0 },
    cost_details: {
      upstream_inference_prompt_cost: opts.promptTokens * opts.pricing.prompt,
      upstream_inference_completions_cost: opts.completionTokens * opts.pricing.completion,
    },
  };
}

export function chatCompletionPayload(opts: {
  id: string;
  model: string;
  provider: string;
  text: string;
  finishReason: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  isByok: boolean;
  pricing: { prompt: number; completion: number };
  reasoningTokens?: number;
  cachedTokens?: number;
  toolCalls?: unknown[];
  reasoning?: string | null;
  created?: number;
}) {
  const finishReason = canonicalFinishReason(opts.finishReason);
  const toolCalls = opts.toolCalls?.map(canonicalToolCall);
  return {
    id: opts.id,
    object: "chat.completion" as const,
    created: opts.created ?? Math.floor(Date.now() / 1000),
    model: opts.model,
    provider: opts.provider,
    system_fingerprint: null,
    choices: [
      {
        index: 0,
        logprobs: null,
        finish_reason: finishReason,
        native_finish_reason: opts.finishReason,
        message: {
          role: "assistant" as const,
          content: opts.text || null,
          refusal: null,
          reasoning: opts.reasoning ?? null,
          ...(toolCalls?.length ? { tool_calls: toolCalls } : {}),
        },
      },
    ],
    usage: usagePayload(opts),
  };
}

export function chatChunkPayload(opts: {
  id: string;
  model: string;
  provider?: string;
  delta: Record<string, unknown>;
  finishReason: string | null;
  usage?: CompletionUsage;
  created?: number;
}) {
  const finishReason = opts.finishReason == null ? null : canonicalFinishReason(opts.finishReason);
  return {
    id: opts.id,
    object: "chat.completion.chunk" as const,
    created: opts.created ?? Math.floor(Date.now() / 1000),
    model: opts.model,
    ...(opts.provider ? { provider: opts.provider } : {}),
    choices: [
      {
        index: 0,
        delta: opts.delta,
        finish_reason: finishReason,
        native_finish_reason: opts.finishReason,
        logprobs: null,
      },
    ],
    ...(opts.usage ? { usage: opts.usage } : {}),
  };
}

type ChatLike = {
  id: string;
  created?: number;
  model: string;
  provider?: string;
  choices?: Array<{
    finish_reason?: string | null;
    message?: { content?: string | null; reasoning?: string | null; tool_calls?: unknown[] };
  }>;
  usage?: CompletionUsage;
};

/** OpenAI Responses API envelope over a chat.completion body. */
export function toResponseEnvelope(chat: ChatLike) {
  const msg = chat.choices?.[0]?.message;
  const text = typeof msg?.content === "string" ? msg.content : "";
  const finish = chat.choices?.[0]?.finish_reason ?? "stop";
  const incomplete = finish === "length" || finish === "max_tokens";
  const message = text
    ? [
        {
          type: "message" as const,
          id: `msg_${chat.id}`,
          status: incomplete ? ("incomplete" as const) : ("completed" as const),
          role: "assistant" as const,
          content: [
            {
              type: "output_text" as const,
              text,
              annotations: [] as unknown[],
              logprobs: [] as unknown[],
            },
          ],
        },
      ]
    : [];
  return {
    id: chat.id.startsWith("gen-") ? `resp_${chat.id.slice(4)}` : `resp_${chat.id}`,
    object: "response" as const,
    created_at: chat.created ?? Math.floor(Date.now() / 1000),
    status: incomplete ? ("incomplete" as const) : ("completed" as const),
    error: null,
    incomplete_details: incomplete ? { reason: "max_output_tokens" as const } : null,
    model: chat.model,
    output: [
      ...message,
      ...(msg?.tool_calls ?? []).map((call, i) => {
        const toolCall = canonicalToolCall(call, i);
        return {
        type: "function_call" as const,
        id: `fc_${chat.id}_${i}`,
          call_id: toolCall.id,
          name: toolCall.function.name,
          arguments: toolCall.function.arguments,
          status: "completed" as const,
        };
      }),
    ],
    usage: {
      input_tokens: chat.usage?.prompt_tokens ?? 0,
      input_tokens_details: {
        cached_tokens: chat.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      },
      output_tokens: chat.usage?.completion_tokens ?? 0,
      total_tokens: chat.usage?.total_tokens ?? 0,
      output_tokens_details: {
        reasoning_tokens: chat.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
      },
    },
    metadata: {
      provider: chat.provider ?? "",
      cost_usd: String(chat.usage?.cost ?? 0),
      is_byok: String(chat.usage?.is_byok ?? false),
      nexus_chat_id: chat.id,
    },
  };
}

/** Anthropic Messages API envelope over a chat.completion body. */
export function toAnthropicMessage(chat: ChatLike) {
  const msg = chat.choices?.[0]?.message;
  const text = typeof msg?.content === "string" ? msg.content : "";
  const finish = chat.choices?.[0]?.finish_reason ?? "stop";
  const stopReason =
    finish === "stop" ? "end_turn" : finish === "length" ? "max_tokens" : finish === "tool_calls" ? "tool_use" : finish;
  return {
    id: chat.id.startsWith("gen-") ? `msg_${chat.id.slice(4)}` : chat.id,
    type: "message" as const,
    role: "assistant" as const,
    model: chat.model,
    content: [
      { type: "text" as const, text },
      ...((msg?.tool_calls ?? []).map((call) => {
        const c = canonicalToolCall(call, 0);
        return {
          type: "tool_use" as const,
          id: c.id,
          name: c.function.name,
          input: (() => {
            try {
              return JSON.parse(c.function.arguments);
            } catch {
              return {};
            }
          })(),
        };
      })),
    ].filter((block) => block.type !== "text" || block.text),
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: chat.usage?.prompt_tokens ?? 0,
      output_tokens: chat.usage?.completion_tokens ?? 0,
    },
    nexus: {
      provider: chat.provider ?? null,
      cost: chat.usage?.cost ?? 0,
      is_byok: chat.usage?.is_byok ?? false,
      chat_id: chat.id,
    },
  };
}

/** If the chat handler streamed, remap SSE to the target protocol; otherwise reshape JSON. */
export async function reshapeChatResponse(
  res: Response,
  shape: "response" | "anthropic",
): Promise<Response> {
  if (!res.ok) return res;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("text/event-stream")) {
    return reshapeChatStream(res, shape);
  }
  const chat = (await res.json()) as ChatLike;
  const body = shape === "response" ? toResponseEnvelope(chat) : toAnthropicMessage(chat);
  return Response.json(body, {
    status: res.status,
    headers: {
      "X-Nexus-Upstream-Object": "chat.completion",
      "X-Nexus-Envelope": shape,
      ...(res.headers.get("x-request-id")
        ? { "X-Request-Id": res.headers.get("x-request-id") as string }
        : {}),
    },
  });
}

export function sseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function chatChunkToProtocolSse(chunk: ReturnType<typeof chatChunkPayload>, shape: "response" | "anthropic") {
  const delta = typeof chunk.choices[0]?.delta?.content === "string" ? chunk.choices[0].delta.content : "";
  const done = chunk.choices[0]?.finish_reason != null;
  const responseId = chunk.id.startsWith("gen-") ? `resp_${chunk.id.slice(4)}` : `resp_${chunk.id}`;
  if (shape === "response") {
    if (delta) {
      return sseEvent("response.output_text.delta", {
        type: "response.output_text.delta",
        item_id: `msg_${chunk.id}`,
        output_index: 0,
        content_index: 0,
        delta,
      });
    }
    if (done) {
      return sseEvent("response.completed", {
        type: "response.completed",
        response: {
          id: responseId,
          object: "response",
          created_at: chunk.created,
          status: "completed",
          model: chunk.model,
          output: [],
          usage: chunk.usage
            ? {
                input_tokens: chunk.usage.prompt_tokens,
                output_tokens: chunk.usage.completion_tokens,
                total_tokens: chunk.usage.total_tokens,
              }
            : null,
          metadata: { provider: chunk.provider ?? "" },
        },
      });
    }
    return "";
  }
  if (delta) {
    return sseEvent("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: delta },
    });
  }
  if (done) {
    const stopReason =
      chunk.choices[0]?.finish_reason === "length" || chunk.choices[0]?.finish_reason === "max_tokens"
        ? "max_tokens"
        : chunk.choices[0]?.finish_reason === "tool_calls"
          ? "tool_use"
          : "end_turn";
    return (
      sseEvent("content_block_stop", { type: "content_block_stop", index: 0 }) +
      sseEvent("message_delta", {
        type: "message_delta",
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: { output_tokens: chunk.usage?.completion_tokens ?? 0 },
      }) +
      sseEvent("message_stop", { type: "message_stop" })
    );
  }
  return "";
}

function reshapeChatStream(res: Response, shape: "response" | "anthropic") {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  let started = false;
  let finished = false;
  let fullText = "";
  let textItemOpen = false;
  let anthropicBlockIndex = 0;
  let sequenceNumber = 0;
  let responseId = "";
  let messageId = "";
  let createdAt = 0;
  let model = "";
  let provider = "";
  let usage: CompletionUsage | undefined;
  const responseOutput: Array<Record<string, unknown>> = [];
  const body = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => {
        if (chunk) controller.enqueue(encoder.encode(chunk));
      };
      const responseEvent = (event: string, data: Record<string, unknown>) => {
        send(sseEvent(event, { ...data, sequence_number: sequenceNumber++ }));
      };
      const responseSnapshot = (status: "in_progress" | "completed" | "incomplete") => ({
        id: responseId,
        object: "response",
        created_at: createdAt,
        status,
        error: null,
        incomplete_details: status === "incomplete" ? { reason: "max_output_tokens" } : null,
        model,
        output: status === "in_progress" ? [] : responseOutput,
        usage:
          status === "in_progress"
            ? null
            : {
                input_tokens: usage?.prompt_tokens ?? 0,
                input_tokens_details: {
                  cached_tokens: usage?.prompt_tokens_details.cached_tokens ?? 0,
                },
                output_tokens: usage?.completion_tokens ?? 0,
                output_tokens_details: {
                  reasoning_tokens: usage?.completion_tokens_details.reasoning_tokens ?? 0,
                },
                total_tokens: usage?.total_tokens ?? 0,
              },
        metadata: { provider },
      });
      const ensureResponseTextItem = () => {
        if (textItemOpen) return;
        textItemOpen = true;
        responseEvent("response.output_item.added", {
          type: "response.output_item.added",
          output_index: responseOutput.length,
          item: {
            id: messageId,
            type: "message",
            status: "in_progress",
            role: "assistant",
            content: [],
          },
        });
        responseEvent("response.content_part.added", {
          type: "response.content_part.added",
          item_id: messageId,
          output_index: responseOutput.length,
          content_index: 0,
          part: { type: "output_text", text: "", annotations: [], logprobs: [] },
        });
      };
      const closeResponseTextItem = (status: "completed" | "incomplete") => {
        if (!textItemOpen) return;
        const outputIndex = responseOutput.length;
        const part = {
          type: "output_text",
          text: fullText,
          annotations: [] as unknown[],
          logprobs: [] as unknown[],
        };
        const item = {
          id: messageId,
          type: "message",
          status,
          role: "assistant",
          content: [part],
        };
        responseEvent("response.output_text.done", {
          type: "response.output_text.done",
          item_id: messageId,
          output_index: outputIndex,
          content_index: 0,
          text: fullText,
          logprobs: [],
        });
        responseEvent("response.content_part.done", {
          type: "response.content_part.done",
          item_id: messageId,
          output_index: outputIndex,
          content_index: 0,
          part,
        });
        responseEvent("response.output_item.done", {
          type: "response.output_item.done",
          output_index: outputIndex,
          item,
        });
        responseOutput.push(item);
        textItemOpen = false;
      };
      const ensureAnthropicTextBlock = () => {
        if (textItemOpen) return;
        textItemOpen = true;
        send(
          sseEvent("content_block_start", {
            type: "content_block_start",
            index: anthropicBlockIndex,
            content_block: { type: "text", text: "" },
          }),
        );
      };
      const closeAnthropicTextBlock = () => {
        if (!textItemOpen) return;
        send(sseEvent("content_block_stop", { type: "content_block_stop", index: anthropicBlockIndex }));
        anthropicBlockIndex += 1;
        textItemOpen = false;
      };
      const sendProtocolError = (message: string) => {
        if (shape === "response") {
          responseEvent("error", {
            type: "error",
            code: "invalid_stream_event",
            message,
            param: null,
          });
        } else {
          send(
            sseEvent("error", {
              type: "error",
              error: { type: "api_error", message },
            }),
          );
        }
      };
      const startProtocol = (json: ReturnType<typeof chatChunkPayload>) => {
        if (started) return;
        started = true;
        responseId = json.id.startsWith("gen-")
          ? `resp_${json.id.slice(4)}`
          : `resp_${json.id}`;
        messageId = json.id.startsWith("gen-")
          ? `msg_${json.id.slice(4)}`
          : `msg_${json.id}`;
        createdAt = json.created;
        model = json.model;
        provider = json.provider ?? "";
        if (shape === "response") {
          responseEvent("response.created", {
            type: "response.created",
            response: responseSnapshot("in_progress"),
          });
          responseEvent("response.in_progress", {
            type: "response.in_progress",
            response: responseSnapshot("in_progress"),
          });
        } else {
          send(
            sseEvent("message_start", {
              type: "message_start",
              message: {
                id: messageId,
                type: "message",
                role: "assistant",
                model,
                content: [],
                stop_reason: null,
                stop_sequence: null,
                usage: { input_tokens: 0, output_tokens: 0 },
              },
            }),
          );
        }
      };
      const processChunk = (json: ReturnType<typeof chatChunkPayload>) => {
        startProtocol(json);
        provider = json.provider ?? provider;
        usage = json.usage ?? usage;
        const choice = json.choices[0];
        const delta = choice?.delta;
        const textDelta = typeof delta?.content === "string" ? delta.content : "";
        if (textDelta) {
          fullText += textDelta;
          if (shape === "response") {
            ensureResponseTextItem();
            responseEvent("response.output_text.delta", {
              type: "response.output_text.delta",
              item_id: messageId,
              output_index: responseOutput.length,
              content_index: 0,
              delta: textDelta,
              logprobs: [],
            });
          } else {
            ensureAnthropicTextBlock();
            send(
              sseEvent("content_block_delta", {
                type: "content_block_delta",
                index: anthropicBlockIndex,
                delta: { type: "text_delta", text: textDelta },
              }),
            );
          }
        }

        const rawToolCalls = Array.isArray(delta?.tool_calls) ? delta.tool_calls : [];
        if (rawToolCalls.length) {
          if (shape === "response") closeResponseTextItem("completed");
          else closeAnthropicTextBlock();
          for (const [index, raw] of rawToolCalls.entries()) {
            const call = canonicalToolCall(raw, index);
            if (shape === "response") {
              const outputIndex = responseOutput.length;
              const itemId = `fc_${json.id}_${outputIndex}`;
              responseEvent("response.output_item.added", {
                type: "response.output_item.added",
                output_index: outputIndex,
                item: {
                  type: "function_call",
                  id: itemId,
                  call_id: call.id,
                  name: call.function.name,
                  arguments: "",
                  status: "in_progress",
                },
              });
              responseEvent("response.function_call_arguments.delta", {
                type: "response.function_call_arguments.delta",
                item_id: itemId,
                output_index: outputIndex,
                delta: call.function.arguments,
              });
              responseEvent("response.function_call_arguments.done", {
                type: "response.function_call_arguments.done",
                item_id: itemId,
                output_index: outputIndex,
                arguments: call.function.arguments,
              });
              const item = {
                type: "function_call",
                id: itemId,
                call_id: call.id,
                name: call.function.name,
                arguments: call.function.arguments,
                status: "completed",
              };
              responseEvent("response.output_item.done", {
                type: "response.output_item.done",
                output_index: outputIndex,
                item,
              });
              responseOutput.push(item);
            } else {
              send(
                sseEvent("content_block_start", {
                  type: "content_block_start",
                  index: anthropicBlockIndex,
                  content_block: { type: "tool_use", id: call.id, name: call.function.name, input: {} },
                }),
              );
              send(
                sseEvent("content_block_delta", {
                  type: "content_block_delta",
                  index: anthropicBlockIndex,
                  delta: { type: "input_json_delta", partial_json: call.function.arguments },
                }),
              );
              send(sseEvent("content_block_stop", { type: "content_block_stop", index: anthropicBlockIndex }));
              anthropicBlockIndex += 1;
            }
          }
        }

        if (choice?.finish_reason != null) {
          const incomplete = choice.finish_reason === "length" || choice.finish_reason === "max_tokens";
          if (shape === "response") {
            if (!responseOutput.length && !textItemOpen) ensureResponseTextItem();
            closeResponseTextItem(incomplete ? "incomplete" : "completed");
            const status = incomplete ? "incomplete" : "completed";
            responseEvent(`response.${status}`, {
              type: `response.${status}`,
              response: responseSnapshot(status),
            });
          } else {
            if (anthropicBlockIndex === 0 && !textItemOpen) ensureAnthropicTextBlock();
            closeAnthropicTextBlock();
            const stopReason = incomplete
              ? "max_tokens"
              : choice.finish_reason === "tool_calls"
                ? "tool_use"
                : "end_turn";
            send(
              sseEvent("message_delta", {
                type: "message_delta",
                delta: { stop_reason: stopReason, stop_sequence: null },
                usage: { output_tokens: usage?.completion_tokens ?? 0 },
              }) + sseEvent("message_stop", { type: "message_stop" }),
            );
          }
          finished = true;
        }
      };
      const reader = res.body?.getReader();
      if (!reader) {
        controller.close();
        return;
      }
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split(/\r?\n\r?\n/);
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const data = part
              .split(/\r?\n/)
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n")
              .trim();
            if (!data || data === "[DONE]") continue;
            let json: ReturnType<typeof chatChunkPayload>;
            try {
              json = JSON.parse(data) as ReturnType<typeof chatChunkPayload>;
            } catch {
              sendProtocolError("Upstream emitted malformed JSON in its event stream.");
              controller.close();
              await reader.cancel();
              return;
            }
            processChunk(json);
          }
        }
        buffer += decoder.decode();
        if (!finished) {
          sendProtocolError("Upstream event stream ended before a terminal response event.");
        }
      } catch (error) {
        sendProtocolError(error instanceof Error ? error.message : "Upstream event stream failed.");
      }
      controller.close();
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Nexus-Envelope": shape,
      ...(res.headers.get("x-request-id")
        ? { "X-Request-Id": res.headers.get("x-request-id") as string }
        : {}),
    },
  });
}

