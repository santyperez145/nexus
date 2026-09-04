import { generateText, streamText, embed, embedMany, stepCountIs, type ModelMessage, type ToolSet } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import type { ModelEndpoint } from "@/lib/catalog";
import { envFor, liveBaseURL, providerById } from "@/lib/providers/registry";
import { loadActiveProviderCredential } from "@/lib/providers/onboarding";
import { fetchPublicUrlLimited } from "@/lib/net/public-url";
import type { ChatMessage } from "./types";

function envKey(adapter: string, override?: string) {
  if (override) return override;
  const spec = providerById(adapter);
  return spec ? envFor(spec) : undefined;
}

function inlineFileData(value: string, filename?: string) {
  const dataUrl = /^data:([^;,]+);base64,([\s\S]+)$/.exec(value);
  if (dataUrl) return { data: dataUrl[2], mediaType: dataUrl[1] };
  const extension = filename?.split(".").pop()?.toLowerCase();
  const mediaType =
    extension === "pdf"
      ? "application/pdf"
      : extension === "json"
        ? "application/json"
        : extension === "txt" || extension === "md" || extension === "csv"
          ? "text/plain"
          : "application/octet-stream";
  return { data: value, mediaType };
}

function toCoreMessages(messages: ChatMessage[]): ModelMessage[] {
  return messages.map((m) => {
    if (m.role === "tool") {
      const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "");
      return {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: m.tool_call_id ?? "tool",
            toolName: m.name ?? "tool",
            output: { type: "text", value: text },
          },
        ],
      } as ModelMessage;
    }
    const role = m.role;
    if (role === "assistant" && m.tool_calls?.length) {
      const content: Array<Record<string, unknown>> = [];
      const text =
        typeof m.content === "string"
          ? m.content
          : m.content.map((part) => part.text ?? "").join("");
      if (text) content.push({ type: "text", text });
      for (const [index, raw] of m.tool_calls.entries()) {
        const call = raw as {
          id?: string;
          toolCallId?: string;
          name?: string;
          toolName?: string;
          input?: unknown;
          function?: { name?: string; arguments?: string };
        };
        let input = call.input ?? {};
        if (call.function?.arguments) {
          try {
            input = JSON.parse(call.function.arguments);
          } catch {
            input = {};
          }
        }
        content.push({
          type: "tool-call",
          toolCallId: call.toolCallId ?? call.id ?? `tool_${index}`,
          toolName: call.toolName ?? call.function?.name ?? call.name ?? "tool",
          input,
        });
      }
      return { role: "assistant", content } as ModelMessage;
    }
    if (typeof m.content === "string") {
      return { role, content: m.content } as ModelMessage;
    }
    if (role === "system") {
      return {
        role,
        content: (m.content ?? []).map((part) => part.text ?? "").join("\n"),
      } as ModelMessage;
    }
    const parts = (m.content ?? []).flatMap<Record<string, unknown>>((p) => {
      const imageUrl = typeof p.image_url === "string" ? p.image_url : p.image_url?.url;
      if (imageUrl) return [{ type: "image" as const, image: imageUrl }];
      if (p.source?.type === "base64" && p.source.data) {
        return [{
          type: "image" as const,
          image: `data:${p.source.media_type ?? "image/png"};base64,${p.source.data}`,
        }];
      }
      if (p.source?.type === "url" && p.source.url) {
        return [{ type: "image" as const, image: p.source.url }];
      }
      if (p.input_audio) {
        return [{
          type: "file" as const,
          data: p.input_audio.data,
          mediaType: p.input_audio.format === "mp3" ? "audio/mpeg" : "audio/wav",
        }];
      }
      if (p.file?.file_data) {
        const file = inlineFileData(p.file.file_data, p.file.filename);
        return [{
          type: "file" as const,
          data: file.data,
          mediaType: file.mediaType,
          ...(p.file.filename ? { filename: p.file.filename } : {}),
        }];
      }
      // Stored file ids are expanded by attachUserFiles before provider execution.
      if (p.file?.file_id) return [];
      return [{ type: "text" as const, text: p.text ?? p.refusal ?? "" }];
    });
    return { role, content: parts } as ModelMessage;
  });
}

/** Exported for unit tests — multimodal OpenAI → AI SDK parts. */
export function mapChatMessagesForProvider(messages: ChatMessage[]) {
  return toCoreMessages(messages);
}

type ProviderAccess = {
  apiKey: string;
  protocol?: "openai" | "anthropic" | "google" | "mistral";
  baseUrl?: string;
};

const MANAGED_PROVIDER_RESPONSE_MAX_BYTES = 64 * 1024 * 1024;
const MANAGED_PROVIDER_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

const managedProviderFetch: typeof globalThis.fetch = async (input, init) => {
  const request = input instanceof Request ? input : null;
  const raw = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
  const method = init?.method ?? request?.method;
  const inheritedSignal = init?.signal ?? request?.signal;
  const signal = inheritedSignal
    ? AbortSignal.any([inheritedSignal, AbortSignal.timeout(MANAGED_PROVIDER_REQUEST_TIMEOUT_MS)])
    : AbortSignal.timeout(MANAGED_PROVIDER_REQUEST_TIMEOUT_MS);
  return fetchPublicUrlLimited(
    raw,
    {
      ...init,
      ...(method ? { method } : {}),
      ...(init?.headers ? {} : request?.headers ? { headers: request.headers } : {}),
      ...(init?.body || !request || method === "GET" || method === "HEAD"
        ? {}
        : { body: request.body }),
      signal,
    },
    MANAGED_PROVIDER_RESPONSE_MAX_BYTES,
    { status: 502, code: "provider_invalid_response" },
  );
};

function languageModel(endpoint: ModelEndpoint, access: ProviderAccess) {
  const model = endpoint.providerModel;
  const spec = providerById(endpoint.adapter);
  const kind = access.protocol ?? endpoint.runtimeProtocol ?? spec?.kind ?? "openai";
  const baseURL = access.baseUrl ?? endpoint.runtimeBaseUrl ?? (spec ? liveBaseURL(spec) : undefined);
  const apiKey = access.apiKey;
  const providerFetch = endpoint.providerConnectionId ? managedProviderFetch : undefined;

  if (kind === "anthropic") {
    return createAnthropic({ apiKey, ...(baseURL ? { baseURL } : {}), ...(providerFetch ? { fetch: providerFetch } : {}) })(model);
  }
  if (kind === "google") {
    return createGoogleGenerativeAI({ apiKey, ...(baseURL ? { baseURL } : {}), ...(providerFetch ? { fetch: providerFetch } : {}) })(model);
  }
  if (kind === "mistral") {
    return createMistral({ apiKey, ...(baseURL ? { baseURL } : {}), ...(providerFetch ? { fetch: providerFetch } : {}) })(model);
  }

  return createOpenAI({ apiKey, ...(baseURL ? { baseURL } : {}), ...(providerFetch ? { fetch: providerFetch } : {}) })(model);
}

export function hasProviderKey(endpoint: ModelEndpoint, byok?: string) {
  return Boolean(byok || endpoint.providerConnectionId || envKey(endpoint.adapter));
}

async function runtimeProviderAccess(endpoint: ModelEndpoint, byok?: string): Promise<ProviderAccess | null> {
  if (byok) return { apiKey: byok };
  if (endpoint.providerConnectionId) {
    return loadActiveProviderCredential(endpoint);
  }
  const apiKey = envKey(endpoint.adapter);
  return apiKey ? { apiKey } : null;
}

export async function completeChat(opts: {
  endpoint: ModelEndpoint;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  byok?: string;
  /** Skip lab keys (guest playground). */
  forceLocal?: boolean;
  tools?: ToolSet;
  toolChoice?: "auto" | "none" | "required" | { type: "tool"; toolName: string };
  seed?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string | string[];
  responseFormat?: { type: string; json_schema?: unknown };
  reasoningEffort?: "low" | "medium" | "high";
  signal?: AbortSignal;
}) {
  const access = opts.forceLocal ? null : await runtimeProviderAccess(opts.endpoint, opts.byok);
  if (!access) {
    if (opts.forceLocal) return localComplete(opts.messages, opts.endpoint);
    throw Object.assign(new Error("No provider credentials for this route. Configure BYOK or a platform key."), {
      status: 503,
      code: "provider_unwired",
    });
  }
  const stop = opts.stop == null ? undefined : Array.isArray(opts.stop) ? opts.stop : [opts.stop];
  const openai: {
    responseFormat?: { type: "json_object" } | { type: "json_schema"; schema: unknown };
    reasoningEffort?: "low" | "medium" | "high";
  } = {};
  if (opts.responseFormat?.type === "json_schema" && opts.responseFormat.json_schema) {
    openai.responseFormat = { type: "json_schema", schema: opts.responseFormat.json_schema };
  } else if (opts.responseFormat?.type === "json_object" || opts.responseFormat?.type === "json_schema") {
    openai.responseFormat = { type: "json_object" };
  }
  if (opts.reasoningEffort) openai.reasoningEffort = opts.reasoningEffort;
  const result = await generateText({
    model: languageModel(opts.endpoint, access),
    messages: toCoreMessages(opts.messages),
    temperature: opts.temperature,
    maxOutputTokens: opts.maxTokens,
    seed: opts.seed,
    topP: opts.topP,
    topK: opts.topK,
    frequencyPenalty: opts.frequencyPenalty,
    presencePenalty: opts.presencePenalty,
    stopSequences: stop,
    abortSignal: opts.signal,
    ...(Object.keys(openai).length ? { providerOptions: { openai } as never } : {}),
    ...(opts.tools
      ? {
          tools: opts.tools,
          stopWhen: stepCountIs(6),
          ...(opts.toolChoice ? { toolChoice: opts.toolChoice } : {}),
        }
      : {}),
  });
  const reasoning = typeof result.reasoningText === "string" ? result.reasoningText : null;
  return {
    text: result.text,
    promptTokens: result.usage.inputTokens ?? estimateTokens(opts.messages),
    completionTokens: result.usage.outputTokens ?? estimateTokens(result.text),
    reasoningTokens: result.usage.outputTokenDetails?.reasoningTokens ?? 0,
    cachedTokens: result.usage.inputTokenDetails?.cacheReadTokens ?? 0,
    finishReason: result.finishReason ?? "stop",
    toolCalls: result.toolCalls?.length ? result.toolCalls : undefined,
    reasoning,
    local: false,
  };
}

export async function streamChat(opts: {
  endpoint: ModelEndpoint;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  byok?: string;
  forceLocal?: boolean;
  tools?: ToolSet;
  toolChoice?: "auto" | "none" | "required" | { type: "tool"; toolName: string };
  seed?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string | string[];
  signal?: AbortSignal;
}) {
  const access = opts.forceLocal ? null : await runtimeProviderAccess(opts.endpoint, opts.byok);
  if (!access) {
    if (opts.forceLocal) {
      const local = await localComplete(opts.messages, opts.endpoint);
      return { ...local, stream: null as ReadableStream<string> | null };
    }
    throw Object.assign(new Error("No provider credentials for this route. Configure BYOK or a platform key."), {
      status: 503,
      code: "provider_unwired",
    });
  }
  const stop = opts.stop == null ? undefined : Array.isArray(opts.stop) ? opts.stop : [opts.stop];
  const result = streamText({
    model: languageModel(opts.endpoint, access),
    messages: toCoreMessages(opts.messages),
    temperature: opts.temperature,
    maxOutputTokens: opts.maxTokens,
    seed: opts.seed,
    topP: opts.topP,
    topK: opts.topK,
    frequencyPenalty: opts.frequencyPenalty,
    presencePenalty: opts.presencePenalty,
    stopSequences: stop,
    abortSignal: opts.signal,
    ...(opts.tools
      ? {
          tools: opts.tools,
          stopWhen: stepCountIs(6),
          ...(opts.toolChoice ? { toolChoice: opts.toolChoice } : {}),
        }
      : {}),
  });
  return {
    textStream: result.textStream,
    usage: result.usage,
    finishReason: result.finishReason,
    toolCalls: result.toolCalls,
    local: false,
  };
}

export async function embedTexts(opts: {
  texts: string[];
  endpoint: ModelEndpoint;
  byok?: string;
  dimensions?: number;
  user?: string;
  signal?: AbortSignal;
}) {
  const access = await runtimeProviderAccess(opts.endpoint, opts.byok);
  if (!access) {
    throw Object.assign(new Error("No provider credentials for this embedding route."), {
      status: 503,
      code: "provider_unwired",
    });
  }
  const kind = access.protocol ?? opts.endpoint.runtimeProtocol ?? providerById(opts.endpoint.adapter)?.kind ?? "openai";
  const baseURL = access.baseUrl ?? opts.endpoint.runtimeBaseUrl ?? (() => {
    const spec = providerById(opts.endpoint.adapter);
    return spec ? liveBaseURL(spec) : undefined;
  })();
  const modelId = opts.endpoint.providerModel;
  const providerFetch = opts.endpoint.providerConnectionId ? managedProviderFetch : undefined;
  const model = kind === "google"
    ? createGoogleGenerativeAI({ apiKey: access.apiKey, ...(baseURL ? { baseURL } : {}), ...(providerFetch ? { fetch: providerFetch } : {}) }).embeddingModel(modelId)
    : kind === "mistral"
      ? createMistral({ apiKey: access.apiKey, ...(baseURL ? { baseURL } : {}), ...(providerFetch ? { fetch: providerFetch } : {}) }).embeddingModel(modelId)
      : kind === "openai"
        ? createOpenAI({ apiKey: access.apiKey, ...(baseURL ? { baseURL } : {}), ...(providerFetch ? { fetch: providerFetch } : {}) }).embeddingModel(modelId)
        : null;
  if (!model) {
    throw Object.assign(new Error("Provider protocol does not support embeddings"), {
      status: 503,
      code: "provider_unsupported",
    });
  }
  const providerOptions = opts.dimensions
    ? kind === "google"
      ? { google: { outputDimensionality: opts.dimensions } }
      : kind === "mistral"
        ? { mistral: { outputDimension: opts.dimensions } }
        : { openai: { dimensions: opts.dimensions, ...(opts.user ? { user: opts.user } : {}) } }
    : kind === "openai" && opts.user
      ? { openai: { user: opts.user } }
      : undefined;
  if (opts.texts.length === 1) {
    const result = await embed({
      model,
      value: opts.texts[0],
      abortSignal: opts.signal,
      ...(providerOptions ? { providerOptions: providerOptions as never } : {}),
    });
    return { embeddings: [result.embedding], tokens: result.usage.tokens };
  }
  const result = await embedMany({
    model,
    values: opts.texts,
    abortSignal: opts.signal,
    ...(providerOptions ? { providerOptions: providerOptions as never } : {}),
  });
  return { embeddings: result.embeddings, tokens: result.usage.tokens };
}

async function localComplete(messages: ChatMessage[], endpoint: ModelEndpoint) {
  const text = localEchoText(messages);
  const reply = `[Nexus local · ${endpoint.adapter}/${endpoint.providerModel}] Sin key de lab en este deploy. Agregá BYOK en Settings → Connections o configurá la key de plataforma. Echo: ${text.slice(0, 400)}`;
  return {
    text: reply,
    promptTokens: estimateTokens(messages),
    completionTokens: estimateTokens(reply),
    finishReason: "stop",
    toolCalls: undefined,
    reasoning: null,
    reasoningTokens: 0,
    cachedTokens: 0,
    local: true,
  };
}

export function localEchoText(messages: ChatMessage[]) {
  const last = messages.filter((message) => message.role === "user").at(-1);
  if (typeof last?.content === "string") return last.content || "Hola";
  const text = (last?.content ?? [])
    .map((part) => part.text ?? (part.image_url || part.source ? "[image]" : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
  return text || "Hola";
}

export function estimateTokens(input: string | ChatMessage[]) {
  if (typeof input === "string") return Math.max(1, Math.ceil(input.length / 4));
  const text = input
    .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
    .join(" ");
  return Math.max(1, Math.ceil(text.length / 4));
}
