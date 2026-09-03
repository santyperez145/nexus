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
