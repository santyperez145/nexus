import { NexusError } from "./error.js";
import { iterateSSE } from "./sse.js";
const DEFAULT_BASE = "https://web-production-ef6b3.up.railway.app/api/v1";
function readEnv(name) {
    if (typeof process === "undefined")
        return undefined;
    return process.env?.[name];
}
export class Nexus {
    apiKey;
    baseURL;
    httpReferer;
    title;
    chat;
    models;
    credits;
    generations;
    embeddings;
    images;
    audio;
    responses;
    messages;
    videos;
    completions;
    keys;
    providers;
    files;
    analytics;
    presets;
    guardrails;
    byok;
    workspaces;
    organization;
    observability;
    routing;
    #fetch;
    #defaultHeaders;
    constructor(opts = {}) {
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
    }
    async request(path, init = {}) {
        const url = new URL(this.baseURL + (path.startsWith("/") ? path : `/${path}`));
        for (const [k, v] of Object.entries(init.query ?? {})) {
            if (v != null && v !== "")
                url.searchParams.set(k, String(v));
        }
        const headers = {
            Authorization: `Bearer ${this.apiKey}`,
            ...this.#defaultHeaders,
            ...init.headers,
        };
        if (this.httpReferer)
            headers["HTTP-Referer"] = this.httpReferer;
        if (this.title)
            headers["X-Title"] = this.title;
        let body;
        if (init.form) {
            body = init.form;
        }
        else if (init.body !== undefined) {
            headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
            body = JSON.stringify(init.body);
        }
        const res = await this.#fetch(url, { method: init.method ?? "GET", headers, body });
        if (init.raw)
            return res;
        const json = (await res.json().catch(() => ({})));
        if (!res.ok) {
            throw new NexusError(json.error?.message ?? res.statusText, {
                status: res.status,
                code: json.error?.code,
                metadata: json.error?.metadata,
            });
        }
        return json;
    }
}
class ChatResource {
    client;
    completions;
    constructor(client) {
        this.client = client;
        this.completions = { create: this.send.bind(this) };
    }
    async send(req) {
        if (req.stream) {
            const res = await this.client.request("/chat/completions", {
                method: "POST",
                body: req,
                raw: true,
            });
            if (!res.ok) {
                const json = (await res.json().catch(() => ({})));
                throw new NexusError(json.error?.message ?? res.statusText, {
                    status: res.status,
                    code: json.error?.code,
                    metadata: json.error?.metadata,
                });
            }
            return iterateSSE(res);
        }
        return this.client.request("/chat/completions", { method: "POST", body: req });
    }
}
class ModelsResource {
    client;
    constructor(client) {
        this.client = client;
    }
    list(query = {}) {
        return this.client.request("/models", { query });
    }
    get(id) {
        return this.client.request(`/models/${id}`);
    }
    endpoints(id) {
        return this.client.request(`/models/${id}/endpoints`);
    }
    count() {
        return this.client.request("/models/count");
    }
}
class CreditsResource {
    client;
    constructor(client) {
        this.client = client;
    }
    get() {
        return this.client.request("/credits");
    }
}
class GenerationsResource {
    client;
    constructor(client) {
        this.client = client;
    }
    get(id) {
        return this.client.request("/generation", { query: { id } });
    }
    list(limit = 50) {
        return this.client.request("/generations", { query: { limit } });
    }
}
class EmbeddingsResource {
    client;
    constructor(client) {
        this.client = client;
    }
    create(body) {
        return this.client.request("/embeddings", { method: "POST", body });
    }
}
class ImagesResource {
    client;
    constructor(client) {
        this.client = client;
    }
    generate(body) {
        return this.client.request("/images/generations", {
            method: "POST",
            body,
        });
    }
}
class AudioResource {
    client;
    constructor(client) {
        this.client = client;
    }
    async speech(body) {
        const res = await this.client.request("/audio/speech", { method: "POST", body, raw: true });
        if (!res.ok) {
            throw new NexusError(res.statusText, { status: res.status });
        }
        return res.arrayBuffer();
    }
    transcriptions(body) {
        if ("file" in body && body.file instanceof Blob) {
            const file = body.file;
            const filename = typeof body.filename === "string" ? body.filename : "audio.webm";
            const model = typeof body.model === "string" ? body.model : undefined;
            const form = new FormData();
            form.append("file", file, filename);
            if (model)
                form.append("model", model);
            return this.client.request("/audio/transcriptions", {
                method: "POST",
                form,
            });
        }
        return this.client.request("/audio/transcriptions", {
            method: "POST",
            body,
        });
    }
}
class ResponsesResource {
    client;
    constructor(client) {
        this.client = client;
    }
    create(body) {
        return this.client.request("/responses", { method: "POST", body });
    }
}
class MessagesResource {
    client;
    constructor(client) {
        this.client = client;
    }
    create(body) {
        return this.client.request("/messages", { method: "POST", body });
    }
}
class VideosResource {
    client;
    constructor(client) {
        this.client = client;
    }
    create(body) {
        return this.client.request("/videos", { method: "POST", body });
    }
    get(id) {
        return this.client.request("/videos", { query: { id } });
    }
}
class CompletionsResource {
    client;
    constructor(client) {
        this.client = client;
    }
    create(body) {
        return this.client.request("/completions", { method: "POST", body });
    }
}
class KeysResource {
    client;
    constructor(client) {
        this.client = client;
    }
    list() {
        return this.client.request("/keys");
    }
    create(body = {}) {
        return this.client.request("/keys", { method: "POST", body });
    }
    rotate(id) {
        return this.client.request("/keys", { method: "POST", body: { rotate_id: id } });
    }
    update(body) {
        return this.client.request("/keys", { method: "PATCH", body });
    }
    delete(id) {
        return this.client.request("/keys", { method: "DELETE", query: { id } });
    }
}
class ProvidersResource {
    client;
    constructor(client) {
        this.client = client;
    }
    list() {
        return this.client.request("/providers");
    }
    health() {
        return this.client.request("/providers/health");
    }
}
class FilesResource {
    client;
    constructor(client) {
        this.client = client;
    }
    list() {
        return this.client.request("/files");
    }
    get(id) {
        return this.client.request("/files", { query: { id } });
    }
    upload(file, filename = "file") {
        const form = new FormData();
        form.append("file", file, filename);
        return this.client.request("/files", {
            method: "POST",
            form,
        });
    }
    delete(id) {
        return this.client.request("/files", { method: "DELETE", query: { id } });
    }
}
class AnalyticsResource {
    client;
    constructor(client) {
        this.client = client;
    }
    get(days) {
        return this.client.request("/analytics", { query: days != null ? { days } : {} });
    }
}
class PresetsResource {
    client;
    constructor(client) {
        this.client = client;
    }
    list() {
        return this.client.request("/presets");
    }
    create(body) {
        return this.client.request("/presets", { method: "POST", body });
    }
    delete(id) {
        return this.client.request("/presets", {
            method: "DELETE",
            query: { id },
        });
    }
}
class GuardrailsResource {
    client;
    constructor(client) {
        this.client = client;
    }
    list() {
        return this.client.request("/guardrails");
    }
    create(body) {
        return this.client.request("/guardrails", { method: "POST", body });
    }
    delete(id) {
        return this.client.request("/guardrails", {
            method: "DELETE",
            query: { id },
        });
    }
}
class ByokResource {
    client;
    constructor(client) {
        this.client = client;
    }
    list() {
        return this.client.request("/byok");
    }
    create(body) {
        return this.client.request("/byok", { method: "POST", body });
    }
    delete(id) {
        return this.client.request("/byok", {
            method: "DELETE",
            query: { id },
        });
    }
}
class WorkspacesResource {
    client;
    constructor(client) {
        this.client = client;
    }
    list() {
        return this.client.request("/workspaces");
    }
    create(body = {}) {
        return this.client.request("/workspaces", { method: "POST", body });
    }
    update(body) {
        return this.client.request("/workspaces", { method: "PATCH", body });
    }
    delete(id) {
        return this.client.request("/workspaces", {
            method: "DELETE",
            query: { id },
        });
    }
}
class OrganizationResource {
    client;
    constructor(client) {
        this.client = client;
    }
    get() {
        return this.client.request("/organization");
    }
    create(body) {
        return this.client.request("/organization", { method: "POST", body });
    }
    delete(id) {
        return this.client.request("/organization", {
            method: "DELETE",
            query: { id },
        });
    }
}
class ObservabilityResource {
    client;
    constructor(client) {
        this.client = client;
    }
    list() {
        return this.client.request("/observability");
    }
    create(body) {
        return this.client.request("/observability", { method: "POST", body });
    }
    delete(id) {
        return this.client.request("/observability", {
            method: "DELETE",
            query: { id },
        });
    }
}
class RoutingResource {
    client;
    constructor(client) {
        this.client = client;
    }
    preview(body) {
        return this.client.request("/routing/preview", { method: "POST", body });
    }
}
