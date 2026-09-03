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
            ...(msg?.reasoning ? { annotations: [] as unknown[] } : {}),
          },
        ],
      },
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
    content: [{ type: "text" as const, text }],
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

/** If the chat handler streamed, pass through; otherwise reshape JSON. */
export async function reshapeChatResponse(
  res: Response,
  shape: "response" | "anthropic",
): Promise<Response> {
  if (!res.ok) return res;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("text/event-stream")) return res;
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

