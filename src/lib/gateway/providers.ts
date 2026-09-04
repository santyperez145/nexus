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
  const apiKey = opts.forceLocal ? undefined : envKey(opts.endpoint.adapter, opts.byok);
  if (!apiKey) {
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
  const apiKey = opts.forceLocal ? undefined : envKey(opts.endpoint.adapter, opts.byok);
  if (!apiKey) {
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

export async function embedTexts(texts: string[], modelId: string, byok?: string) {
  const apiKey = envKey("openai", byok) ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error("No provider credentials for embeddings. Configure OPENAI_API_KEY or BYOK."), {
      status: 503,
      code: "provider_unwired",
    });
  }
  const openai = createOpenAI({ apiKey });
  const slug = modelId.includes("/") ? modelId.split("/").pop()! : modelId;
  const model = openai.embedding(slug);
  if (texts.length === 1) {
    const result = await embed({ model, value: texts[0] });
    return [result.embedding];
  }
  const result = await embedMany({ model, values: texts });
  return result.embeddings;
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
