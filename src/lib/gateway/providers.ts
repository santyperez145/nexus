import { generateText, streamText, embed, embedMany, stepCountIs, type ModelMessage, type ToolSet } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import type { ModelEndpoint } from "@/lib/catalog";
import { envFor, liveBaseURL, providerById } from "@/lib/providers/registry";
import type { ChatMessage } from "./types";

function envKey(adapter: string, override?: string) {
  if (override) return override;
  const spec = providerById(adapter);
  return spec ? envFor(spec) : undefined;
}

function toCoreMessages(messages: ChatMessage[]): ModelMessage[] {
  return messages.map((m) => {
    const role = m.role === "tool" ? "assistant" : m.role;
    if (typeof m.content === "string") {
      return { role, content: m.content };
    }
    const parts = (m.content ?? []).map((p) => {
      if (p.image_url?.url) return { type: "image" as const, image: p.image_url.url };
      if (p.type === "image_url" && p.image_url?.url) {
        return { type: "image" as const, image: p.image_url.url };
      }
      return { type: "text" as const, text: p.text ?? "" };
    });
    return { role, content: parts };
  }) as ModelMessage[];
}

/** Exported for unit tests — multimodal OpenAI → AI SDK parts. */
export function mapChatMessagesForProvider(messages: ChatMessage[]) {
  return toCoreMessages(messages);
}

function languageModel(endpoint: ModelEndpoint, apiKey: string) {
  const model = endpoint.providerModel;
  const spec = providerById(endpoint.adapter);

  if (spec?.kind === "anthropic") {
    return createAnthropic({ apiKey })(model);
  }
  if (spec?.kind === "google") {
    return createGoogleGenerativeAI({ apiKey })(model);
  }
  if (spec?.kind === "mistral") {
    return createMistral({ apiKey })(model);
  }

  const baseURL = spec ? liveBaseURL(spec) : undefined;
  return createOpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) })(model);
}

export function hasProviderKey(endpoint: ModelEndpoint, byok?: string) {
  return Boolean(envKey(endpoint.adapter, byok));
}

export async function completeChat(opts: {
  endpoint: ModelEndpoint;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  byok?: string;
  tools?: ToolSet;
  seed?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string | string[];
  responseFormat?: { type: string; json_schema?: unknown };
  reasoningEffort?: "low" | "medium" | "high";
}) {
  const apiKey = envKey(opts.endpoint.adapter, opts.byok);
  if (!apiKey) {
    return localComplete(opts.messages, opts.endpoint);
  }
  const stop = opts.stop == null ? undefined : Array.isArray(opts.stop) ? opts.stop : [opts.stop];
  const openai: {
    responseFormat?: { type: "json_object" };
    reasoningEffort?: "low" | "medium" | "high";
  } = {};
  if (opts.responseFormat?.type === "json_object" || opts.responseFormat?.type === "json_schema") {
    openai.responseFormat = { type: "json_object" };
  }
  if (opts.reasoningEffort) openai.reasoningEffort = opts.reasoningEffort;
  const result = await generateText({
    model: languageModel(opts.endpoint, apiKey),
    messages: toCoreMessages(opts.messages),
    temperature: opts.temperature,
    maxOutputTokens: opts.maxTokens,
    seed: opts.seed,
    topP: opts.topP,
    topK: opts.topK,
    frequencyPenalty: opts.frequencyPenalty,
    presencePenalty: opts.presencePenalty,
    stopSequences: stop,
    ...(Object.keys(openai).length ? { providerOptions: { openai } } : {}),
    ...(opts.tools ? { tools: opts.tools, stopWhen: stepCountIs(6) } : {}),
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
  tools?: ToolSet;
  seed?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string | string[];
}) {
  const apiKey = envKey(opts.endpoint.adapter, opts.byok);
  if (!apiKey) {
    const local = await localComplete(opts.messages, opts.endpoint);
    return { ...local, stream: null as ReadableStream<string> | null };
  }
  const stop = opts.stop == null ? undefined : Array.isArray(opts.stop) ? opts.stop : [opts.stop];
  const result = streamText({
    model: languageModel(opts.endpoint, apiKey),
    messages: toCoreMessages(opts.messages),
    temperature: opts.temperature,
    maxOutputTokens: opts.maxTokens,
    seed: opts.seed,
    topP: opts.topP,
    topK: opts.topK,
    frequencyPenalty: opts.frequencyPenalty,
    presencePenalty: opts.presencePenalty,
    stopSequences: stop,
    ...(opts.tools ? { tools: opts.tools, stopWhen: stepCountIs(6) } : {}),
  });
  return {
    textStream: result.textStream,
    usage: result.usage,
    finishReason: result.finishReason,
    local: false,
  };
}

export async function embedTexts(texts: string[], modelId: string, byok?: string) {
  const apiKey = envKey("openai", byok) ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return texts.map((t) => localEmbedding(t));
  }
  const openai = createOpenAI({ apiKey });
  const slug = modelId.includes("/") ? modelId.split("/").pop()! : modelId;
  const model = openai.embedding(slug.includes("large") ? "text-embedding-3-large" : "text-embedding-3-small");
  if (texts.length === 1) {
    const result = await embed({ model, value: texts[0] });
    return [result.embedding];
  }
  const result = await embedMany({ model, values: texts });
  return result.embeddings;
}

async function localComplete(messages: ChatMessage[], endpoint: ModelEndpoint) {
  const last = messages.filter((m) => m.role === "user").at(-1);
  const text = typeof last?.content === "string" ? last.content : "Hola";
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

function localEmbedding(text: string) {
  const dim = 256;
  const vec = new Array(dim).fill(0);
  for (let i = 0; i < text.length; i++) vec[i % dim] += text.charCodeAt(i) / 255;
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export function estimateTokens(input: string | ChatMessage[]) {
  if (typeof input === "string") return Math.max(1, Math.ceil(input.length / 4));
  const text = input
    .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
    .join(" ");
  return Math.max(1, Math.ceil(text.length / 4));
}
