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
        finish_reason: opts.finishReason,
        native_finish_reason: opts.finishReason,
        message: {
          role: "assistant" as const,
          content: opts.text || null,
          refusal: null,
          reasoning: opts.reasoning ?? null,
          ...(opts.toolCalls?.length ? { tool_calls: opts.toolCalls } : {}),
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
      ...(msg?.tool_calls ?? []).map((call, i) => ({
        type: "function_call" as const,
        id: `fc_${chat.id}_${i}`,
        call,
      })),
    ],
    usage: {
      input_tokens: chat.usage?.prompt_tokens ?? 0,
      output_tokens: chat.usage?.completion_tokens ?? 0,
      total_tokens: chat.usage?.total_tokens ?? 0,
      output_tokens_details: {
        reasoning_tokens: chat.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
      },
    },
    metadata: {
      provider: chat.provider ?? null,
      cost: chat.usage?.cost ?? 0,
      is_byok: chat.usage?.is_byok ?? false,
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
        const c = call as { id?: string; function?: { name?: string; arguments?: string }; name?: string };
        return {
          type: "tool_use" as const,
          id: c.id ?? "tool",
          name: c.function?.name ?? c.name ?? "tool",
          input: (() => {
            try {
              return JSON.parse(c.function?.arguments ?? "{}");
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
    },
  });
}

export function sseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function chatChunkToProtocolSse(chunk: ReturnType<typeof chatChunkPayload>, shape: "response" | "anthropic") {
  const delta = typeof chunk.choices[0]?.delta?.content === "string" ? chunk.choices[0].delta.content : "";
  const done = chunk.choices[0]?.finish_reason != null;
  if (shape === "response") {
    if (delta) {
      return sseEvent("response.output_text.delta", { type: "response.output_text.delta", delta });
    }
    if (done) {
      return sseEvent("response.completed", {
        type: "response.completed",
        response: { id: chunk.id.startsWith("gen-") ? `resp_${chunk.id.slice(4)}` : `resp_${chunk.id}`, status: "completed" },
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
    return sseEvent("message_stop", { type: "message_stop" });
  }
  return "";
}

function reshapeChatStream(res: Response, shape: "response" | "anthropic") {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  const body = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => {
        if (chunk) controller.enqueue(encoder.encode(chunk));
      };
      if (shape === "response") {
        send(sseEvent("response.created", { type: "response.created" }));
      } else {
        send(sseEvent("message_start", { type: "message_start" }));
        send(sseEvent("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }));
      }
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
            send(chatChunkToProtocolSse(json, shape));
          } catch {
            /* skip malformed */
          }
        }
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Nexus-Envelope": shape,
    },
  });
}

