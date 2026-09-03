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

function canonicalToolCall(raw: unknown, index: number): CanonicalToolCall {
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
        finish_reason: opts.finishReason,
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
  return {
    id: chat.id.startsWith("gen-") ? `resp_${chat.id.slice(4)}` : `resp_${chat.id}`,
    object: "response" as const,
    created_at: chat.created ?? Math.floor(Date.now() / 1000),
    status: finish === "stop" || finish === "end_turn" ? "completed" : "incomplete",
    error: null,
    incomplete_details: null,
    model: chat.model,
    output: [
      {
        type: "message" as const,
        id: `msg_${chat.id}`,
        status: "completed" as const,
        role: "assistant" as const,
        content: [
          {
            type: "output_text" as const,
            text,
          },
        ],
      },
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
      chunk.choices[0]?.finish_reason === "length"
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
  const body = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => {
        if (chunk) controller.enqueue(encoder.encode(chunk));
      };
      const reader = res.body?.getReader();
      if (!reader) {
        controller.close();
        return;
      }
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") continue;
          try {
            const json = JSON.parse(raw) as ReturnType<typeof chatChunkPayload>;
            if (!started) {
              started = true;
              if (shape === "response") {
                const responseId = json.id.startsWith("gen-")
                  ? `resp_${json.id.slice(4)}`
                  : `resp_${json.id}`;
                send(
                  sseEvent("response.created", {
                    type: "response.created",
                    response: {
                      id: responseId,
                      object: "response",
                      created_at: json.created,
                      status: "in_progress",
                      model: json.model,
                      output: [],
                    },
                  }),
                );
              } else {
                send(
                  sseEvent("message_start", {
                    type: "message_start",
                    message: {
                      id: json.id.startsWith("gen-") ? `msg_${json.id.slice(4)}` : json.id,
                      type: "message",
                      role: "assistant",
                      model: json.model,
                      content: [],
                      stop_reason: null,
                      stop_sequence: null,
                      usage: { input_tokens: 0, output_tokens: 0 },
                    },
                  }),
                );
                send(
                  sseEvent("content_block_start", {
                    type: "content_block_start",
                    index: 0,
                    content_block: { type: "text", text: "" },
                  }),
                );
              }
            }
            send(chatChunkToProtocolSse(json, shape));
          } catch {
            /* skip malformed */
          }
        }
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

