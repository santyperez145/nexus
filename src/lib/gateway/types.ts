export type ChatContentPart = {
  type: string;
  text?: string;
  refusal?: string;
  image_url?: { url: string } | string;
  input_audio?: { data: string; format: "wav" | "mp3" };
  file?: { file_data?: string; file_id?: string; filename?: string };
  source?: { type?: string; media_type?: string; data?: string; url?: string };
};

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ChatContentPart[];
  name?: string;
  tool_call_id?: string;
  tool_calls?: unknown[];
};

/** OpenAI accepts developer plus deprecated function messages at the API boundary. */
export type ChatInputMessage = Omit<ChatMessage, "role"> & {
  role: ChatMessage["role"] | "developer" | "function";
  function_call?: { name: string; arguments: string };
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
  max_price?: { prompt?: number; completion?: number; request?: number; image?: number };
  preferred_min_throughput?: number;
  preferred_max_latency?: number;
};

export type ChatRequest = {
  model?: string;
  models?: string[];
  messages?: ChatInputMessage[];
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
  tools?: unknown[];
  tool_choice?: unknown;
  response_format?: { type: string; json_schema?: unknown };
  provider?: ProviderPreferences;
  route?: "fallback";
  plugins?: Array<{ id: string; [key: string]: unknown }>;
  user?: string;
  seed?: number;
  logprobs?: boolean;
  top_logprobs?: number;
  include_reasoning?: boolean;
  reasoning?: { effort?: "low" | "medium" | "high"; max_tokens?: number };
  transforms?: Array<"middle-out">;
  stream_options?: { include_usage?: boolean };
  file_ids?: string[];
  store?: boolean;
  background?: boolean;
  prompt_cache_retention?: "in_memory" | "24h";
};

export type AuthContext = {
  /** Human or API-key actor used for ownership and audit attribution. */
  userId: string;
  /** Server-derived wallet owner. Shared workspaces bill their owning account. */
  billingUserId?: string;
  apiKeyId?: string;
  workspaceId?: string | null;
  workspaceIds?: string[];
  isManagement: boolean;
  scopes?: string[];
  plan?: string;
  creditMicros: number;
  zdr: boolean;
  allowTraining: boolean;
  logPrompts: boolean;
  /** Public playground: eco local only, never lab keys. */
  guest?: boolean;
};
