import type { NexusModelId } from "./model-ids.js";
export type { NexusModelId };
export type ChatRole = "system" | "developer" | "user" | "assistant" | "tool" | "function";
export type ChatContentPart = {
    type: string;
    text?: string;
    refusal?: string;
    image_url?: {
        url: string;
    } | string;
    input_audio?: {
        data: string;
        format: "wav" | "mp3";
    };
    file?: {
        file_data?: string;
        file_id?: string;
        filename?: string;
    };
};
export type ChatMessage = {
    role: ChatRole;
    content: string | ChatContentPart[];
    name?: string;
    tool_call_id?: string;
    tool_calls?: unknown[];
    /** Deprecated OpenAI function-call shape; normalized to tool_calls by Nexus. */
    function_call?: {
        name: string;
        arguments: string;
    };
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
    max_price?: {
        prompt?: number;
        completion?: number;
    };
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
    response_format?: {
        type: string;
        json_schema?: unknown;
    };
    provider?: ProviderPreferences;
    plugins?: Array<{
        id: string;
        [key: string]: unknown;
    }>;
    transforms?: Array<"middle-out">;
    include_reasoning?: boolean;
    reasoning?: {
        effort?: "low" | "medium" | "high";
        max_tokens?: number;
    };
    stream_options?: {
        include_usage?: boolean;
    };
    file_ids?: string[];
    user?: string;
};
export type CompletionUsage = {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost?: number;
    is_byok?: boolean;
    prompt_tokens_details?: {
        cached_tokens: number;
        audio_tokens: number;
    };
    completion_tokens_details?: {
        reasoning_tokens: number;
    };
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
        delta: {
            role?: string;
            content?: string;
        };
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
export type DatasetRepository = {
    id: string;
    namespace: string;
    slug: string;
    path: string;
    title: string;
    description: string;
    visibility: "public" | "private";
    gated: boolean;
    license: string;
    task: string | null;
    tags: string[];
    latest_revision: number;
    downloads: number;
    created_at: string;
    updated_at: string;
};
export type DatasetCreateRequest = {
    namespace: string;
    slug: string;
    title: string;
    description?: string;
    visibility?: "public" | "private";
    gated?: boolean;
    license?: string;
    task?: string | null;
    tags?: string[];
    workspace_id?: string | null;
};
export type DatasetRevisionRequest = {
    commit_message: string;
    metadata?: Record<string, unknown>;
    files: Array<{
        file_id: string;
        path: string;
    }>;
};
