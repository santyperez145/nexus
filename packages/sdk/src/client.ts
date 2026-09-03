import { NexusError } from "./error.js";
import { iterateSSE } from "./sse.js";
import type {
  ChatChunk,
  ChatCompletion,
  ChatRequest,
  NexusClientOptions,
} from "./types.js";

const DEFAULT_BASE = "https://web-production-ef6b3.up.railway.app/api/v1";

function readEnv(name: string) {
  if (typeof process === "undefined") return undefined;
  return process.env?.[name];
}

export class Nexus {
  readonly apiKey: string;
  readonly baseURL: string;
  readonly httpReferer?: string;
  readonly title?: string;
  readonly chat: ChatResource;
  readonly models: ModelsResource;
  readonly credits: CreditsResource;
  readonly generations: GenerationsResource;
  readonly embeddings: EmbeddingsResource;
  readonly images: ImagesResource;
  readonly audio: AudioResource;
  readonly keys: KeysResource;
  readonly providers: ProvidersResource;
  readonly files: FilesResource;
  readonly analytics: AnalyticsResource;
  #fetch: typeof fetch;
  #defaultHeaders: Record<string, string>;

  constructor(opts: NexusClientOptions = {}) {
    this.apiKey = opts.apiKey ?? readEnv("NEXUS_API_KEY") ?? "";
    this.baseURL = (opts.baseURL ?? readEnv("NEXUS_BASE_URL") ?? DEFAULT_BASE).replace(/\/$/, "");
    this.httpReferer = opts.httpReferer;
    this.title = opts.title;
    this.#fetch = opts.fetch ?? fetch;
    this.#defaultHeaders = opts.defaultHeaders ?? {};
    this.chat = new ChatResource(this);
    this.models = new ModelsResource(this);
    this.credits = new CreditsResource(this);
    this.generations = new GenerationsResource(this);
    this.embeddings = new EmbeddingsResource(this);
    this.images = new ImagesResource(this);
    this.audio = new AudioResource(this);
    this.keys = new KeysResource(this);
    this.providers = new ProvidersResource(this);
    this.files = new FilesResource(this);
    this.analytics = new AnalyticsResource(this);
  }

  async request<T>(
    path: string,
    init: {
      method?: string;
      body?: unknown;
      form?: FormData;
      query?: Record<string, string | number | undefined>;
      headers?: Record<string, string>;
      raw?: boolean;
    } = {},
  ): Promise<T> {
    const url = new URL(this.baseURL + (path.startsWith("/") ? path : `/${path}`));
    for (const [k, v] of Object.entries(init.query ?? {})) {
      if (v != null && v !== "") url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      ...this.#defaultHeaders,
      ...init.headers,
    };
    if (this.httpReferer) headers["HTTP-Referer"] = this.httpReferer;
    if (this.title) headers["X-Title"] = this.title;
    let body: BodyInit | undefined;
    if (init.form) {
      body = init.form;
    } else if (init.body !== undefined) {
      headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
      body = JSON.stringify(init.body);
    }
    const res = await this.#fetch(url, { method: init.method ?? "GET", headers, body });
    if (init.raw) return res as T;
    const json = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string; metadata?: Record<string, unknown> };
    };
    if (!res.ok) {
      throw new NexusError(json.error?.message ?? res.statusText, {
        status: res.status,
        code: json.error?.code,
        metadata: json.error?.metadata,
      });
    }
    return json as T;
  }
}

class ChatResource {
  completions: { create: ChatResource["send"] };
  constructor(private readonly client: Nexus) {
    this.completions = { create: this.send.bind(this) };
  }

  send(req: ChatRequest & { stream: true }): Promise<AsyncIterable<ChatChunk>>;
  send(req: ChatRequest & { stream?: false }): Promise<ChatCompletion>;
  send(req: ChatRequest): Promise<ChatCompletion | AsyncIterable<ChatChunk>>;
  async send(req: ChatRequest): Promise<ChatCompletion | AsyncIterable<ChatChunk>> {
    if (req.stream) {
      const res = await this.client.request<Response>("/chat/completions", {
        method: "POST",
        body: req,
        raw: true,
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: { message?: string; code?: string; metadata?: Record<string, unknown> };
        };
        throw new NexusError(json.error?.message ?? res.statusText, {
          status: res.status,
          code: json.error?.code,
          metadata: json.error?.metadata,
        });
      }
      return iterateSSE(res);
    }
    return this.client.request<ChatCompletion>("/chat/completions", { method: "POST", body: req });
  }
}

class ModelsResource {
  constructor(private readonly client: Nexus) {}
  list(query: { category?: string; output_modalities?: string; supported_parameters?: string } = {}) {
    return this.client.request<{ data: unknown[] }>("/models", { query });
  }
  get(id: string) {
    return this.client.request<{ data: unknown }>(`/models/${id}`);
  }
  endpoints(id: string) {
    return this.client.request<{ data: unknown }>(`/models/${id}/endpoints`);
  }
  count() {
    return this.client.request<{ data: { count: number } }>("/models/count");
  }
}

class CreditsResource {
  constructor(private readonly client: Nexus) {}
  get() {
    return this.client.request<{ data: { total_credits: number; total_usage: number; remaining: number } }>(
      "/credits",
    );
  }
}

class GenerationsResource {
  constructor(private readonly client: Nexus) {}
  get(id: string) {
    return this.client.request<{ data: unknown }>("/generation", { query: { id } });
  }
  list(limit = 50) {
    return this.client.request<{ data: unknown[] }>("/generations", { query: { limit } });
  }
}

class EmbeddingsResource {
  constructor(private readonly client: Nexus) {}
  create(body: { model?: string; input: string | string[] }) {
    return this.client.request<{ data: Array<{ embedding: number[]; index: number }>; model: string }>(
      "/embeddings",
      { method: "POST", body },
    );
  }
}

class ImagesResource {
  constructor(private readonly client: Nexus) {}
  generate(body: { prompt: string; model?: string; size?: string; n?: number }) {
    return this.client.request<{ data: Array<{ b64_json?: string; url?: string }> }>("/images/generations", {
      method: "POST",
      body,
    });
  }
}

class AudioResource {
  constructor(private readonly client: Nexus) {}
  async speech(body: { input: string; model?: string; voice?: string; response_format?: string }) {
    const res = await this.client.request<Response>("/audio/speech", { method: "POST", body, raw: true });
    if (!res.ok) {
      throw new NexusError(res.statusText, { status: res.status });
    }
    return res.arrayBuffer();
  }
  transcriptions(body: Record<string, unknown>) {
    return this.client.request<{ text: string }>("/audio/transcriptions", { method: "POST", body });
  }
}

class KeysResource {
  constructor(private readonly client: Nexus) {}
  list() {
    return this.client.request<{ data: unknown[] }>("/keys");
  }
  create(body: { name?: string; limit?: number; is_management?: boolean; workspace_id?: string } = {}) {
    return this.client.request<{ data: { key: string } }>("/keys", { method: "POST", body });
  }
  rotate(id: string) {
    return this.client.request<{ data: { key: string } }>("/keys", { method: "POST", body: { rotate_id: id } });
  }
  update(body: { id: string; name?: string; disabled?: boolean; limit?: number | null }) {
    return this.client.request<{ data: unknown }>("/keys", { method: "PATCH", body });
  }
  delete(id: string) {
    return this.client.request<{ data: { success: boolean } }>("/keys", { method: "DELETE", query: { id } });
  }
}

class ProvidersResource {
  constructor(private readonly client: Nexus) {}
  list() {
    return this.client.request<{ data: unknown[] }>("/providers");
  }
  health() {
    return this.client.request<{ data: unknown }>("/providers/health");
  }
}

class FilesResource {
  constructor(private readonly client: Nexus) {}
  list() {
    return this.client.request<{ data: unknown[] }>("/files");
  }
  get(id: string) {
    return this.client.request<{ data: unknown }>("/files", { query: { id } });
  }
  upload(file: Blob, filename = "file") {
    const form = new FormData();
    form.append("file", file, filename);
    return this.client.request<{ data: { id: string; filename: string; bytes: number } }>("/files", {
      method: "POST",
      form,
    });
  }
  delete(id: string) {
    return this.client.request<{ data: { success: boolean } }>("/files", { method: "DELETE", query: { id } });
  }
}

class AnalyticsResource {
  constructor(private readonly client: Nexus) {}
  get() {
    return this.client.request<{
      data: {
        totals: { requests: number; tokens: number; cost: number };
        by_model: Array<{ model: string; tokens: number; cost: number; requests: number }>;
      };
    }>("/analytics");
  }
}
