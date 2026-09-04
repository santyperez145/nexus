import { NexusError } from "./error.js";
import { iterateSSE } from "./sse.js";
const DEFAULT_BASE = "http://127.0.0.1:3000/api/v1";
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
    guest;
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
    status;
    shares;
    datasets;
    spaces;
    auth;
    oauth;
    #fetch;
    #defaultHeaders;
    constructor(opts = {}) {
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
    async request(path, init = {}) {
        const url = new URL(this.baseURL + (path.startsWith("/") ? path : `/${path}`));
        for (const [k, v] of Object.entries(init.query ?? {})) {
            if (v != null && v !== "")
                url.searchParams.set(k, String(v));
        }
        const headers = {
            ...this.#defaultHeaders,
            ...init.headers,
        };
        if (this.apiKey)
            headers.Authorization = `Bearer ${this.apiKey}`;
        else if (this.guest)
            headers["X-Nexus-Guest"] = "1";
        if (this.guest && !headers["X-Nexus-Guest"])
            headers["X-Nexus-Guest"] = "1";
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
    /** Used by SDK resources for already-authorized, provider-hosted transfer URLs. */
    fetchSigned(url, init) {
        return this.#fetch(url, init);
    }
}
async function blobSha256Hex(blob) {
    if (!globalThis.crypto?.subtle) {
        throw new Error("This runtime does not provide Web Crypto SHA-256 support");
    }
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
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
    repositories;
    constructor(client) {
        this.client = client;
        const path = (namespace, slug, suffix = "") => `/models/${encodeURIComponent(namespace)}/${encodeURIComponent(slug)}${suffix}`;
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
                const response = await this.client.request(path(namespace, slug, `/resolve/${encodeURIComponent(String(revision))}/${encodedPath}`), { raw: true });
                if (!response.ok)
                    throw new NexusError(response.statusText, { status: response.status });
                return response.arrayBuffer();
            },
        };
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
    list(query = {}) {
        return this.client.request("/generations", {
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
        return this.client.request("/images/generations", { method: "POST", body });
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
    createUpload(input) {
        return this.client.request("/files/uploads", { method: "POST", body: input });
    }
    signUploadParts(id, parts) {
        return this.client.request(`/files/uploads/${encodeURIComponent(id)}/parts`, {
            method: "POST",
            body: { parts },
        });
    }
    listUploadParts(id) {
        return this.client.request(`/files/uploads/${encodeURIComponent(id)}/parts`);
    }
    completeUpload(id) {
        return this.client.request(`/files/uploads/${encodeURIComponent(id)}/complete`, {
            method: "POST",
        });
    }
    async uploadArtifact(file, input) {
        const reservation = await this.createUpload({
            filename: input.filename,
            mime: file.type || "application/octet-stream",
            bytes: file.size,
            sha256: input.sha256,
            workspace_id: input.workspace_id,
        });
        if (reservation.data.upload.strategy === "single") {
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
        }
        else {
            const { part_count: partCount, part_size: partSize } = reservation.data.upload;
            const concurrency = 4;
            for (let start = 1; start <= partCount; start += concurrency) {
                const numbers = Array.from({ length: Math.min(concurrency, partCount - start + 1) }, (_, index) => start + index);
                const chunks = await Promise.all(numbers.map(async (partNumber) => {
                    const offset = (partNumber - 1) * partSize;
                    const blob = file.slice(offset, Math.min(offset + partSize, file.size));
                    return { partNumber, blob, sha256: await blobSha256Hex(blob) };
                }));
                const signed = await this.signUploadParts(reservation.data.id, chunks.map((part) => ({ part_number: part.partNumber, sha256: part.sha256 })));
                await Promise.all(signed.data.map(async (part) => {
                    const chunk = chunks.find((item) => item.partNumber === part.part_number);
                    if (!chunk || chunk.blob.size !== part.bytes) {
                        throw new NexusError("Invalid multipart reservation", {
                            status: 409,
                            code: "invalid_upload_state",
                        });
                    }
                    let response = null;
                    for (let attempt = 0; attempt < 3 && !response?.ok; attempt += 1) {
                        response = await this.client
                            .fetchSigned(part.url, { method: part.method, headers: part.headers, body: chunk.blob })
                            .catch(() => null);
                    }
                    if (!response?.ok) {
                        throw new NexusError(`Object storage rejected upload part ${part.part_number} (${response?.status ?? "network"})`, { status: response?.status ?? 502, code: "object_storage_error" });
                    }
                }));
            }
        }
        return this.completeUpload(reservation.data.id);
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
class StatusResource {
    client;
    constructor(client) {
        this.client = client;
    }
    get() {
        return this.client.request("/status");
    }
}
class SharesResource {
    client;
    constructor(client) {
        this.client = client;
    }
    create(body) {
        return this.client.request("/shares", {
            method: "POST",
            body,
        });
    }
    get(id) {
        return this.client.request("/shares", { query: { id } });
    }
    list() {
        return this.client.request("/shares");
    }
    delete(id) {
        return this.client.request("/shares", {
            method: "DELETE",
            query: { id },
        });
    }
}
class OauthResource {
    client;
    constructor(client) {
        this.client = client;
    }
    /** Describe PKCE flow (no auth required). */
    describe() {
        return this.client.request("/oauth");
    }
    /** Issue one-time code (requires user session / account bearer). */
    challenge(codeChallenge) {
        return this.client.request("/oauth", {
            method: "POST",
            body: { code_challenge: codeChallenge },
        });
    }
    /** Exchange code + verifier for sk-nx- key (shown once). */
    exchange(code, codeVerifier) {
        return this.client.request("/oauth", {
            method: "POST",
            body: { code, code_verifier: codeVerifier },
        });
    }
}
class DatasetsResource {
    client;
    revisions;
    access;
    constructor(client) {
        this.client = client;
        this.revisions = {
            list: (namespace, slug) => this.client.request(this.path(namespace, slug, "/revisions")),
            create: (namespace, slug, body) => this.client.request(this.path(namespace, slug, "/revisions"), {
                method: "POST",
                body,
            }),
        };
        this.access = {
            list: (namespace, slug) => this.client.request(this.path(namespace, slug, "/access")),
            request: (namespace, slug) => this.client.request(this.path(namespace, slug, "/access"), {
                method: "POST",
            }),
            decide: (namespace, slug, id, status) => this.client.request(this.path(namespace, slug, "/access"), {
                method: "PATCH",
                body: { id, status },
            }),
        };
    }
    path(namespace, slug, suffix = "") {
        return `/datasets/${encodeURIComponent(namespace)}/${encodeURIComponent(slug)}${suffix}`;
    }
    list(opts = {}) {
        return this.client.request("/datasets", { query: opts });
    }
    get(namespace, slug) {
        return this.client.request(this.path(namespace, slug));
    }
    create(body) {
        return this.client.request("/datasets", {
            method: "POST",
            body,
        });
    }
    update(namespace, slug, body) {
        return this.client.request(this.path(namespace, slug), {
            method: "PATCH",
            body,
        });
    }
    delete(namespace, slug) {
        return this.client.request(this.path(namespace, slug), { method: "DELETE" });
    }
    async download(namespace, slug, revision, path) {
        const filePath = path.split("/").map(encodeURIComponent).join("/");
        const response = await this.client.request(this.path(namespace, slug, `/resolve/${encodeURIComponent(String(revision))}/${filePath}`), { raw: true });
        if (!response.ok)
            throw new NexusError(response.statusText, { status: response.status });
        return response.arrayBuffer();
    }
    models(opts) {
        const window = opts?.window && opts.window !== "all" ? opts.window : undefined;
        return this.client.request("/datasets/models", { query: window ? { window } : undefined });
    }
}
class SpacesResource {
    client;
    constructor(client) {
        this.client = client;
    }
    path(namespace, slug, suffix = "") {
        return `/spaces/${encodeURIComponent(namespace)}/${encodeURIComponent(slug)}${suffix}`;
    }
    list(opts = {}) {
        return this.client.request("/spaces", { query: opts });
    }
    get(namespace, slug) {
        return this.client.request(this.path(namespace, slug));
    }
    create(body) {
        return this.client.request("/spaces", { method: "POST", body });
    }
    update(namespace, slug, body) {
        return this.client.request(this.path(namespace, slug), {
            method: "PATCH",
            body,
        });
    }
    delete(namespace, slug) {
        return this.client.request(this.path(namespace, slug), { method: "DELETE" });
    }
    run(namespace, slug, body) {
        return this.client.request(this.path(namespace, slug, "/run"), {
            method: "POST",
            body,
        });
    }
}
class AuthResource {
    client;
    constructor(client) {
        this.client = client;
    }
    key() {
        return this.client.request("/auth/key");
    }
}
