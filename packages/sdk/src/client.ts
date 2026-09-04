import { NexusError } from "./error.js";
import { iterateSSE } from "./sse.js";
import type {
  ChatChunk,
  ChatCompletion,
  ChatRequest,
  DatasetCreateRequest,
  DatasetRepository,
  DatasetRevisionRequest,
  ModelRepository,
  ModelRepositoryCreateRequest,
  ModelRepositoryRevisionRequest,
  Space,
  SpaceCreateRequest,
  NexusClientOptions,
} from "./types.js";

const DEFAULT_BASE = "http://127.0.0.1:3000/api/v1";

function readEnv(name: string) {
  if (typeof process === "undefined") return undefined;
  return process.env?.[name];
}

export class Nexus {
  readonly apiKey: string;
  readonly baseURL: string;
  readonly httpReferer?: string;
  readonly title?: string;
  readonly guest: boolean;
  readonly chat: ChatResource;
  readonly models: ModelsResource;
  readonly credits: CreditsResource;
  readonly generations: GenerationsResource;
  readonly embeddings: EmbeddingsResource;
  readonly images: ImagesResource;
  readonly audio: AudioResource;
  readonly responses: ResponsesResource;
  readonly messages: MessagesResource;
  readonly videos: VideosResource;
  readonly completions: CompletionsResource;
  readonly keys: KeysResource;
  readonly providers: ProvidersResource;
  readonly files: FilesResource;
  readonly analytics: AnalyticsResource;
  readonly presets: PresetsResource;
  readonly guardrails: GuardrailsResource;
  readonly byok: ByokResource;
  readonly workspaces: WorkspacesResource;
  readonly organization: OrganizationResource;
  readonly observability: ObservabilityResource;
  readonly routing: RoutingResource;
  readonly status: StatusResource;
  readonly shares: SharesResource;
  readonly datasets: DatasetsResource;
  readonly spaces: SpacesResource;
  readonly auth: AuthResource;
  readonly oauth: OauthResource;
  #fetch: typeof fetch;
  #defaultHeaders: Record<string, string>;

  constructor(opts: NexusClientOptions = {}) {
    this.apiKey = opts.apiKey ?? readEnv("NEXUS_API_KEY") ?? "";
    this.baseURL = (opts.baseURL ?? readEnv("NEXUS_BASE_URL") ?? DEFAULT_BASE).replace(/\/$/, "");
    this.httpReferer = opts.httpReferer;
    this.title = opts.title;
    this.guest = Boolean(opts.guest);
    this.#fetch = opts.fetch ?? fetch;
    this.#defaultHeaders = opts.defaultHeaders ?? {};
    this.chat = new ChatResource(this);
    this.models = new ModelsResource(this);
    this.credits = new CreditsResource(this);
    this.generations = new GenerationsResource(this);
    this.embeddings = new EmbeddingsResource(this);
    this.images = new ImagesResource(this);
    this.audio = new AudioResource(this);
    this.responses = new ResponsesResource(this);
    this.messages = new MessagesResource(this);
    this.videos = new VideosResource(this);
    this.completions = new CompletionsResource(this);
    this.keys = new KeysResource(this);
    this.providers = new ProvidersResource(this);
    this.files = new FilesResource(this);
    this.analytics = new AnalyticsResource(this);
    this.presets = new PresetsResource(this);
    this.guardrails = new GuardrailsResource(this);
    this.byok = new ByokResource(this);
    this.workspaces = new WorkspacesResource(this);
    this.organization = new OrganizationResource(this);
    this.observability = new ObservabilityResource(this);
    this.routing = new RoutingResource(this);
    this.status = new StatusResource(this);
    this.shares = new SharesResource(this);
    this.datasets = new DatasetsResource(this);
    this.spaces = new SpacesResource(this);
    this.auth = new AuthResource(this);
    this.oauth = new OauthResource(this);
  }

  async request<T>(
    path: string,
    init: {
      method?: string;
      body?: unknown;
      form?: FormData;
      query?: Record<string, string | number | boolean | undefined>;
      headers?: Record<string, string>;
      raw?: boolean;
    } = {},
  ): Promise<T> {
    const url = new URL(this.baseURL + (path.startsWith("/") ? path : `/${path}`));
    for (const [k, v] of Object.entries(init.query ?? {})) {
      if (v != null && v !== "") url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = {
      ...this.#defaultHeaders,
      ...init.headers,
    };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    else if (this.guest) headers["X-Nexus-Guest"] = "1";
    if (this.guest && !headers["X-Nexus-Guest"]) headers["X-Nexus-Guest"] = "1";
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

  /** Used by SDK resources for already-authorized, provider-hosted transfer URLs. */
  fetchSigned(url: string, init: RequestInit) {
    return this.#fetch(url, init);
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
  readonly repositories: {
    list: (opts?: { q?: string; pipeline_tag?: string; tag?: string; mine?: boolean; limit?: number }) => Promise<{ data: ModelRepository[]; meta: { count: number; scope: string } }>;
    get: (namespace: string, slug: string) => Promise<{ data: ModelRepository & { access: unknown; revisions: unknown[] } }>;
    create: (body: ModelRepositoryCreateRequest) => Promise<{ data: ModelRepository }>;
    update: (namespace: string, slug: string, body: Partial<Omit<ModelRepositoryCreateRequest, "namespace" | "slug" | "workspace_id">>) => Promise<{ data: ModelRepository }>;
    delete: (namespace: string, slug: string) => Promise<{ data: { id: string; deleted: boolean } }>;
    revisions: {
      list: (namespace: string, slug: string) => Promise<{ data: unknown[] }>;
      create: (namespace: string, slug: string, body: ModelRepositoryRevisionRequest) => Promise<{ data: unknown }>;
    };
    download: (namespace: string, slug: string, revision: string | number, path: string) => Promise<ArrayBuffer>;
  };

  constructor(private readonly client: Nexus) {
    const path = (namespace: string, slug: string, suffix = "") =>
      `/models/${encodeURIComponent(namespace)}/${encodeURIComponent(slug)}${suffix}`;
    this.repositories = {
      list: (opts = {}) => this.client.request("/models", { query: { ...opts, mine: opts.mine ?? true } }),
      get: (namespace, slug) => this.client.request(path(namespace, slug)),
      create: (body) => this.client.request("/models", { method: "POST", body }),
      update: (namespace, slug, body) => this.client.request(path(namespace, slug), { method: "PATCH", body }),
      delete: (namespace, slug) => this.client.request(path(namespace, slug), { method: "DELETE" }),
      revisions: {
        list: (namespace, slug) => this.client.request(path(namespace, slug, "/revisions")),
        create: (namespace, slug, body) => this.client.request(path(namespace, slug, "/revisions"), { method: "POST", body }),
      },
      download: async (namespace, slug, revision, filePath) => {
        const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
        const response = await this.client.request<Response>(
          path(namespace, slug, `/resolve/${encodeURIComponent(String(revision))}/${encodedPath}`),
          { raw: true },
        );
        if (!response.ok) throw new NexusError(response.statusText, { status: response.status });
        return response.arrayBuffer();
      },
    };
  }
  list(
    query: {
      category?: string;
      output_modalities?: string;
      supported_parameters?: string;
      include_reference?: boolean;
      pipeline_tag?: string;
      tag?: string;
      q?: string;
      limit?: number;
    } = {},
  ) {
    return this.client.request<{ data: unknown[] }>("/models", { query });
  }
  get(id: string) {
    return this.client.request<{ data: unknown }>(`/models/${id}`);
  }
  endpoints(id: string) {
    return this.client.request<{ data: unknown }>(`/models/${id}/endpoints`);
  }
  count() {
    return this.client.request<{
      data: { count: number; executable: number; reference_only: number };
    }>("/models/count");
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
  list(
    query: {
      limit?: number;
      model?: string;
      provider?: string;
      byok?: "0" | "1";
      errors?: "0" | "1";
      days?: number;
      api_key?: string;
      workspace?: string;
      app?: string;
    } = {},
  ) {
    return this.client.request<{ data: unknown[] }>("/generations", {
      query: {
        limit: query.limit ?? 50,
        ...(query.model ? { model: query.model } : {}),
        ...(query.provider ? { provider: query.provider } : {}),
        ...(query.byok ? { byok: query.byok } : {}),
        ...(query.errors ? { errors: query.errors } : {}),
        ...(query.days ? { days: query.days } : {}),
        ...(query.api_key ? { api_key: query.api_key } : {}),
        ...(query.workspace ? { workspace: query.workspace } : {}),
        ...(query.app ? { app: query.app } : {}),
      },
    });
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
  generate(body: {
    prompt: string;
    model?: string;
    size?: "1024x1024" | "1024x1536" | "1536x1024";
    quality?: "low" | "medium" | "high";
    n?: number;
  }) {
    return this.client.request<{
      data: Array<{ b64_json?: string; url?: string }>;
      id?: string;
      model?: string;
      cost?: number;
      price_version?: string;
    }>("/images/generations", { method: "POST", body });
  }
}

class AudioResource {
  constructor(private readonly client: Nexus) {}
  async speech(body: {
    input: string;
    model?: string;
    voice?: string;
    response_format?: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
    speed?: number;
    instructions?: string;
  }) {
    const res = await this.client.request<Response>("/audio/speech", { method: "POST", body, raw: true });
    if (!res.ok) {
      throw new NexusError(res.statusText, { status: res.status });
    }
    return res.arrayBuffer();
  }
  transcriptions(body: { file: Blob; filename?: string; model?: string } | Record<string, unknown>) {
    if ("file" in body && body.file instanceof Blob) {
      const file = body.file;
      const filename = typeof body.filename === "string" ? body.filename : "audio.webm";
      const model = typeof body.model === "string" ? body.model : undefined;
      const form = new FormData();
      form.append("file", file, filename);
      if (model) form.append("model", model);
      return this.client.request<{ text: string; id?: string; duration?: number; cost?: number }>("/audio/transcriptions", {
        method: "POST",
        form,
      });
    }
    return this.client.request<{ text: string; id?: string; duration?: number; cost?: number }>("/audio/transcriptions", {
      method: "POST",
      body,
    });
  }
}

class ResponsesResource {
  constructor(private readonly client: Nexus) {}
  create(body: Record<string, unknown>) {
    return this.client.request<{
      id: string;
      object: "response";
      status: string;
      output: unknown[];
      usage?: unknown;
    }>("/responses", { method: "POST", body });
  }
}

class MessagesResource {
  constructor(private readonly client: Nexus) {}
  create(body: Record<string, unknown>) {
    return this.client.request<{
      id: string;
      type: "message";
      role: string;
      content: unknown[];
      stop_reason?: string;
    }>("/messages", { method: "POST", body });
  }
}

class VideosResource {
  constructor(private readonly client: Nexus) {}
  create(body: { prompt: string; model?: string }) {
    return this.client.request<{
      id: string;
      status: string;
      generation_id?: string;
      polling_url?: string;
    }>("/videos", { method: "POST", body });
  }
  get(id: string) {
    return this.client.request<{ data: unknown }>("/videos", { query: { id } });
  }
}

class CompletionsResource {
  constructor(private readonly client: Nexus) {}
  create(body: Record<string, unknown> & { prompt?: string; model?: string }) {
    return this.client.request<ChatCompletion>("/completions", { method: "POST", body });
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
  createUpload(input: {
    filename: string;
    mime?: string;
    bytes: number;
    sha256: string;
    workspace_id?: string | null;
  }) {
    return this.client.request<{
      data: {
        id: string;
        filename: string;
        bytes: number;
        status: "pending";
        storage_backend: "s3";
        sha256: string;
        upload: {
          method: "PUT";
          url: string;
          headers: Record<string, string>;
          expires_at: string;
        };
      };
    }>("/files/uploads", { method: "POST", body: input });
  }
  completeUpload(id: string) {
    return this.client.request<{ data: unknown }>(`/files/uploads/${encodeURIComponent(id)}/complete`, {
      method: "POST",
    });
  }
  async uploadArtifact(
    file: Blob,
    input: { filename: string; sha256: string; workspace_id?: string | null },
  ) {
    const reservation = await this.createUpload({
      filename: input.filename,
      mime: file.type || "application/octet-stream",
      bytes: file.size,
      sha256: input.sha256,
      workspace_id: input.workspace_id,
    });
    const uploaded = await this.client.fetchSigned(reservation.data.upload.url, {
      method: reservation.data.upload.method,
      headers: reservation.data.upload.headers,
      body: file,
    });
    if (!uploaded.ok) {
      throw new NexusError(`Object storage rejected the upload (${uploaded.status})`, {
        status: uploaded.status,
        code: "object_storage_error",
      });
    }
    return this.completeUpload(reservation.data.id);
  }
  delete(id: string) {
    return this.client.request<{ data: { success: boolean } }>("/files", { method: "DELETE", query: { id } });
  }
}

class AnalyticsResource {
  constructor(private readonly client: Nexus) {}
  get(days?: number) {
    return this.client.request<{
      data: {
        totals: { requests: number; tokens: number; cost: number };
        by_model: Array<{ model: string; tokens: number; cost: number; requests: number }>;
      };
    }>("/analytics", { query: days != null ? { days } : {} });
  }
}

class PresetsResource {
  constructor(private readonly client: Nexus) {}
  list() {
    return this.client.request<{ data: unknown[] }>("/presets");
  }
  create(body: Record<string, unknown>) {
    return this.client.request<{ data: unknown }>("/presets", { method: "POST", body });
  }
  delete(id: string) {
    return this.client.request<{ data: { success: boolean } }>("/presets", {
      method: "DELETE",
      query: { id },
    });
  }
}

class GuardrailsResource {
  constructor(private readonly client: Nexus) {}
  list() {
    return this.client.request<{ data: unknown[] }>("/guardrails");
  }
  create(body: Record<string, unknown>) {
    return this.client.request<{ data: unknown }>("/guardrails", { method: "POST", body });
  }
  delete(id: string) {
    return this.client.request<{ data: { success: boolean } }>("/guardrails", {
      method: "DELETE",
      query: { id },
    });
  }
}

class ByokResource {
  constructor(private readonly client: Nexus) {}
  list() {
    return this.client.request<{ data: unknown[] }>("/byok");
  }
  create(body: { provider: string; key: string }) {
    return this.client.request<{ data: unknown }>("/byok", { method: "POST", body });
  }
  delete(id: string) {
    return this.client.request<{ data: { success: boolean } }>("/byok", {
      method: "DELETE",
      query: { id },
    });
  }
}

class WorkspacesResource {
  constructor(private readonly client: Nexus) {}
  list() {
    return this.client.request<{ data: unknown[] }>("/workspaces");
  }
  create(body: { name?: string; limit?: number; interval?: string } = {}) {
    return this.client.request<{ data: unknown }>("/workspaces", { method: "POST", body });
  }
  update(body: Record<string, unknown> & { id: string }) {
    return this.client.request<{ data: unknown }>("/workspaces", { method: "PATCH", body });
  }
  delete(id: string) {
    return this.client.request<{ data: { success: boolean } }>("/workspaces", {
      method: "DELETE",
      query: { id },
    });
  }
}

class OrganizationResource {
  constructor(private readonly client: Nexus) {}
  get() {
    return this.client.request<{ data: unknown }>("/organization");
  }
  create(body: Record<string, unknown>) {
    return this.client.request<{ data: unknown }>("/organization", { method: "POST", body });
  }
  delete(id: string) {
    return this.client.request<{ data: { success: boolean } }>("/organization", {
      method: "DELETE",
      query: { id },
    });
  }
}

class ObservabilityResource {
  constructor(private readonly client: Nexus) {}
  list() {
    return this.client.request<{ data: unknown[] }>("/observability");
  }
  create(body: { url: string; secret?: string }) {
    return this.client.request<{ data: unknown }>("/observability", { method: "POST", body });
  }
  delete(id: string) {
    return this.client.request<{ data: { success: boolean } }>("/observability", {
      method: "DELETE",
      query: { id },
    });
  }
}

class RoutingResource {
  constructor(private readonly client: Nexus) {}
  preview(body: {
    model: string;
    messages?: Array<{ role: string; content: string }>;
    provider?: Record<string, unknown>;
  }) {
    return this.client.request<{
      data: {
        requested: string;
        mode: string;
        hops: Array<{ model: string; adapter: string; wired: boolean; zdr: boolean }>;
        note: string;
        guest?: boolean;
      };
    }>("/routing/preview", { method: "POST", body });
  }
}

class StatusResource {
  constructor(private readonly client: Nexus) {}
  get() {
    return this.client.request<{
      data?: Record<string, unknown>;
      providers?: Record<string, boolean>;
    }>("/status");
  }
}

class SharesResource {
  constructor(private readonly client: Nexus) {}
  create(body: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    title?: string;
    stats?: Record<string, unknown> | null;
  }) {
    return this.client.request<{ data: { id: string; url: string; title: string } }>("/shares", {
      method: "POST",
      body,
    });
  }
  get(id: string) {
    return this.client.request<{
      data: {
        id: string;
        title: string | null;
        payload: { model: string; messages: Array<{ role: string; content: string }> };
      };
    }>("/shares", { query: { id } });
  }
  list() {
    return this.client.request<{
      data: Array<{
        id: string;
        title: string | null;
        model: string;
        url: string;
        created_at: string;
      }>;
    }>("/shares");
  }
  delete(id: string) {
    return this.client.request<{ data: { id: string; deleted: boolean } }>("/shares", {
      method: "DELETE",
      query: { id },
    });
  }
}

class OauthResource {
  constructor(private readonly client: Nexus) {}
  /** Describe PKCE flow (no auth required). */
  describe() {
    return this.client.request<{ data: { flow: string; steps: string[] } }>("/oauth");
  }
  /** Issue one-time code (requires user session / account bearer). */
  challenge(codeChallenge: string) {
    return this.client.request<{ code: string }>("/oauth", {
      method: "POST",
      body: { code_challenge: codeChallenge },
    });
  }
  /** Exchange code + verifier for sk-nx- key (shown once). */
  exchange(code: string, codeVerifier: string) {
    return this.client.request<{ key: string }>("/oauth", {
      method: "POST",
      body: { code, code_verifier: codeVerifier },
    });
  }
}

class DatasetsResource {
  readonly revisions: {
    list: (namespace: string, slug: string) => Promise<{ data: unknown[] }>;
    create: (
      namespace: string,
      slug: string,
      body: DatasetRevisionRequest,
    ) => Promise<{ data: unknown }>;
  };
  readonly access: {
    list: (namespace: string, slug: string) => Promise<{ data: unknown }>;
    request: (namespace: string, slug: string) => Promise<{ data: { status: string } }>;
    decide: (
      namespace: string,
      slug: string,
      id: string,
      status: "approved" | "rejected",
    ) => Promise<{ data: unknown }>;
  };

  constructor(private readonly client: Nexus) {
    this.revisions = {
      list: (namespace, slug) =>
        this.client.request<{ data: unknown[] }>(this.path(namespace, slug, "/revisions")),
      create: (namespace, slug, body) =>
        this.client.request<{ data: unknown }>(this.path(namespace, slug, "/revisions"), {
          method: "POST",
          body,
        }),
    };
    this.access = {
      list: (namespace, slug) =>
        this.client.request<{ data: unknown }>(this.path(namespace, slug, "/access")),
      request: (namespace, slug) =>
        this.client.request<{ data: { status: string } }>(this.path(namespace, slug, "/access"), {
          method: "POST",
        }),
      decide: (namespace, slug, id, status) =>
        this.client.request<{ data: unknown }>(this.path(namespace, slug, "/access"), {
          method: "PATCH",
          body: { id, status },
        }),
    };
  }

  private path(namespace: string, slug: string, suffix = "") {
    return `/datasets/${encodeURIComponent(namespace)}/${encodeURIComponent(slug)}${suffix}`;
  }

  list(opts: { q?: string; task?: string; tag?: string; mine?: boolean; limit?: number } = {}) {
    return this.client.request<{
      data: DatasetRepository[];
      meta: { count: number; scope: string };
    }>("/datasets", { query: opts });
  }

  get(namespace: string, slug: string) {
    return this.client.request<{
      data: DatasetRepository & { access: unknown; revisions: unknown[] };
    }>(this.path(namespace, slug));
  }

  create(body: DatasetCreateRequest) {
    return this.client.request<{ data: DatasetRepository }>("/datasets", {
      method: "POST",
      body,
    });
  }

  update(
    namespace: string,
    slug: string,
    body: Partial<Omit<DatasetCreateRequest, "namespace" | "slug" | "workspace_id">>,
  ) {
    return this.client.request<{ data: DatasetRepository }>(this.path(namespace, slug), {
      method: "PATCH",
      body,
    });
  }

  delete(namespace: string, slug: string) {
    return this.client.request<{ data: { id: string; deleted: boolean } }>(
      this.path(namespace, slug),
      { method: "DELETE" },
    );
  }

  async download(namespace: string, slug: string, revision: string | number, path: string) {
    const filePath = path.split("/").map(encodeURIComponent).join("/");
    const response = await this.client.request<Response>(
      this.path(namespace, slug, `/resolve/${encodeURIComponent(String(revision))}/${filePath}`),
      { raw: true },
    );
    if (!response.ok) throw new NexusError(response.statusText, { status: response.status });
    return response.arrayBuffer();
  }

  models(opts?: { window?: "7d" | "30d" | "all" }) {
    const window = opts?.window && opts.window !== "all" ? opts.window : undefined;
    return this.client.request<{
      data: Array<{
        model: string;
        tokens: number;
        requests: number;
        avg_latency_ms: number | null;
      }>;
      window: string;
    }>("/datasets/models", { query: window ? { window } : undefined });
  }
}

class SpacesResource {
  constructor(private readonly client: Nexus) {}

  private path(namespace: string, slug: string, suffix = "") {
    return `/spaces/${encodeURIComponent(namespace)}/${encodeURIComponent(slug)}${suffix}`;
  }

  list(opts: { q?: string; model?: string; mine?: boolean; limit?: number } = {}) {
    return this.client.request<{ data: Space[]; meta: { count: number; scope: string } }>(
      "/spaces",
      { query: opts },
    );
  }

  get(namespace: string, slug: string) {
    return this.client.request<{ data: Space & { access: unknown; recent_runs: unknown[] } }>(
      this.path(namespace, slug),
    );
  }

  create(body: SpaceCreateRequest) {
    return this.client.request<{ data: Space }>("/spaces", { method: "POST", body });
  }

  update(
    namespace: string,
    slug: string,
    body: Partial<Omit<SpaceCreateRequest, "namespace" | "slug" | "workspace_id">>,
  ) {
    return this.client.request<{ data: Space }>(this.path(namespace, slug), {
      method: "PATCH",
      body,
    });
  }

  delete(namespace: string, slug: string) {
    return this.client.request<{ data: { id: string; deleted: boolean } }>(
      this.path(namespace, slug),
      { method: "DELETE" },
    );
  }

  run(
    namespace: string,
    slug: string,
    body: { prompt?: string; messages?: Array<{ role: "user" | "assistant"; content: string }> },
  ) {
    return this.client.request<ChatCompletion>(this.path(namespace, slug, "/run"), {
      method: "POST",
      body,
    });
  }
}

class AuthResource {
  constructor(private readonly client: Nexus) {}
  key() {
    return this.client.request<{
      data: {
        label?: string | null;
        is_management?: boolean;
        limit?: number | null;
        usage?: number;
        limit_remaining?: number | null;
      };
    }>("/auth/key");
  }
}
