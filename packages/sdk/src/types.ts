import type { NexusModelId } from "./model-ids.js";

export type { NexusModelId };

export type ChatRole = "system" | "user" | "assistant" | "tool";

export type ChatMessage = {
  role: ChatRole;
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  name?: string;
  tool_call_id?: string;
  tool_calls?: unknown[];
};

export type ProviderPreferences = {
  order?: string[];
  ignore?: string[];
  only?: string[];
  require_parameters?: boolean;
  allow_fallbacks?: boolean;
  data_collection?: "allow" | "deny";
  zdr?: boolean;
  sort?: "price" | "throughput" | "latency";
  quantizations?: string[];
  max_price?: { prompt?: number; completion?: number };
};

export type ChatRequest = {
  model?: NexusModelId;
  models?: NexusModelId[];
  messages?: ChatMessage[];
  prompt?: string;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  top_p?: number;
  top_k?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  seed?: number;
  tools?: unknown[];
  tool_choice?: unknown;
  response_format?: { type: string; json_schema?: unknown };
  provider?: ProviderPreferences;
  plugins?: Array<{ id: string; [key: string]: unknown }>;
  transforms?: Array<"middle-out">;
  include_reasoning?: boolean;
  reasoning?: { effort?: "low" | "medium" | "high"; max_tokens?: number };
  stream_options?: { include_usage?: boolean };
  file_ids?: string[];
  user?: string;
};

export type CompletionUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost?: number;
  is_byok?: boolean;
  prompt_tokens_details?: { cached_tokens: number; audio_tokens: number };
  completion_tokens_details?: { reasoning_tokens: number };
};

export type ChatCompletion = {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  provider?: string;
  choices: Array<{
    index: number;
    finish_reason: string | null;
    native_finish_reason?: string | null;
    message: {
      role: "assistant";
      content: string | null;
      reasoning?: string | null;
      tool_calls?: unknown[];
    };
  }>;
  usage?: CompletionUsage;
};

export type ChatChunk = {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  provider?: string;
  choices: Array<{
    index: number;
    delta: { role?: string; content?: string };
    finish_reason: string | null;
  }>;
  usage?: CompletionUsage;
};

export type NexusClientOptions = {
  apiKey?: string;
  baseURL?: string;
  httpReferer?: string;
  title?: string;
  /** Public playground: send X-Nexus-Guest (local echo). Skip bearer if no apiKey. */
  guest?: boolean;
  fetch?: typeof fetch;
  defaultHeaders?: Record<string, string>;
};
