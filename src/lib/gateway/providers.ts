import { generateText, streamText, embed, embedMany, stepCountIs, type ToolSet } from "ai";
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

function toCoreMessages(messages: ChatMessage[]) {
  return messages.map((m) => {
    const content =
      typeof m.content === "string"
        ? m.content
        : m.content
            .map((p) => p.text ?? (p.image_url ? `[image] ${p.image_url.url}` : ""))
            .join("\n");
    return { role: m.role === "tool" ? "assistant" : m.role, content };
  }) as { role: "system" | "user" | "assistant"; content: string }[];
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
}) {
  const apiKey = envKey(opts.endpoint.adapter, opts.byok);
  if (!apiKey) {
    return localComplete(opts.messages, opts.endpoint);
  }
  const result = await generateText({
    model: languageModel(opts.endpoint, apiKey),
    messages: toCoreMessages(opts.messages),
    temperature: opts.temperature,
    maxOutputTokens: opts.maxTokens,
    seed: opts.seed,
    topP: opts.topP,
    ...(opts.tools ? { tools: opts.tools, stopWhen: stepCountIs(6) } : {}),
  });
  return {
    text: result.text,
    promptTokens: result.usage.inputTokens ?? estimateTokens(opts.messages),
    completionTokens: result.usage.outputTokens ?? estimateTokens(result.text),
    finishReason: result.finishReason ?? "stop",
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
}) {
  const apiKey = envKey(opts.endpoint.adapter, opts.byok);
  if (!apiKey) {
    const local = await localComplete(opts.messages, opts.endpoint);
    return { ...local, stream: null as ReadableStream<string> | null };
  }
  const result = streamText({
    model: languageModel(opts.endpoint, apiKey),
    messages: toCoreMessages(opts.messages),
    temperature: opts.temperature,
    maxOutputTokens: opts.maxTokens,
    seed: opts.seed,
    topP: opts.topP,
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
  const reply = `[Nexus local · ${endpoint.adapter}/${endpoint.providerModel}] No hay API key del proveedor configurada. Echo: ${text.slice(0, 400)}`;
  return {
    text: reply,
    promptTokens: estimateTokens(messages),
    completionTokens: estimateTokens(reply),
    finishReason: "stop",
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
