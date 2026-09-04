import type { ChatChunk, ChatCompletion, ChatRequest, DatasetCreateRequest, DatasetRepository, DatasetRevisionRequest, ModelRepository, ModelRepositoryCreateRequest, ModelRepositoryRevisionRequest, ModelEvaluation, ModelEvaluationCreateRequest, ModelPromotion, ModelPromotionCreateRequest, Space, SpaceCreateRequest, NexusClientOptions } from "./types.js";
export declare class Nexus {
    #private;
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
    constructor(opts?: NexusClientOptions);
    request<T>(path: string, init?: {
        method?: string;
        body?: unknown;
        form?: FormData;
        query?: Record<string, string | number | boolean | undefined>;
        headers?: Record<string, string>;
        raw?: boolean;
    }): Promise<T>;
    /** Used by SDK resources for already-authorized, provider-hosted transfer URLs. */
    fetchSigned(url: string, init: RequestInit): Promise<Response>;
}
declare class ChatResource {
    private readonly client;
    completions: {
        create: ChatResource["send"];
    };
    constructor(client: Nexus);
    send(req: ChatRequest & {
        stream: true;
    }): Promise<AsyncIterable<ChatChunk>>;
    send(req: ChatRequest & {
        stream?: false;
    }): Promise<ChatCompletion>;
    send(req: ChatRequest): Promise<ChatCompletion | AsyncIterable<ChatChunk>>;
}
declare class ModelsResource {
    private readonly client;
    readonly repositories: {
        list: (opts?: {
            q?: string;
            pipeline_tag?: string;
            tag?: string;
            mine?: boolean;
            limit?: number;
        }) => Promise<{
            data: ModelRepository[];
            meta: {
                count: number;
                scope: string;
            };
        }>;
        get: (namespace: string, slug: string) => Promise<{
            data: ModelRepository & {
                access: unknown;
                revisions: unknown[];
            };
        }>;
        create: (body: ModelRepositoryCreateRequest) => Promise<{
            data: ModelRepository;
        }>;
        update: (namespace: string, slug: string, body: Partial<Omit<ModelRepositoryCreateRequest, "namespace" | "slug" | "workspace_id">>) => Promise<{
            data: ModelRepository;
        }>;
        delete: (namespace: string, slug: string) => Promise<{
            data: {
                id: string;
                deleted: boolean;
            };
        }>;
        revisions: {
            list: (namespace: string, slug: string) => Promise<{
                data: unknown[];
            }>;
            create: (namespace: string, slug: string, body: ModelRepositoryRevisionRequest) => Promise<{
                data: unknown;
            }>;
        };
        evaluations: {
            list: (namespace: string, slug: string) => Promise<{
                data: ModelEvaluation[];
                meta: {
                    visibility: string;
                };
            }>;
            create: (namespace: string, slug: string, body: ModelEvaluationCreateRequest) => Promise<{
                data: ModelEvaluation;
            }>;
        };
        promotions: {
            list: (namespace: string, slug: string) => Promise<{
                data: ModelPromotion[];
            }>;
            create: (namespace: string, slug: string, body: ModelPromotionCreateRequest) => Promise<{
                data: ModelPromotion;
            }>;
        };
        download: (namespace: string, slug: string, revision: string | number, path: string) => Promise<ArrayBuffer>;
    };
    constructor(client: Nexus);
    list(query?: {
        category?: string;
        output_modalities?: string;
        supported_parameters?: string;
        include_reference?: boolean;
        pipeline_tag?: string;
        tag?: string;
        q?: string;
        limit?: number;
    }): Promise<{
        data: unknown[];
    }>;
    get(id: string): Promise<{
        data: unknown;
    }>;
    endpoints(id: string): Promise<{
        data: unknown;
    }>;
    count(): Promise<{
        data: {
            count: number;
            executable: number;
            reference_only: number;
        };
    }>;
}
declare class CreditsResource {
    private readonly client;
    constructor(client: Nexus);
    get(): Promise<{
        data: {
            total_credits: number;
            total_usage: number;
            remaining: number;
        };
    }>;
}
declare class GenerationsResource {
    private readonly client;
    constructor(client: Nexus);
    get(id: string): Promise<{
        data: unknown;
    }>;
    list(query?: {
        limit?: number;
        model?: string;
        provider?: string;
        byok?: "0" | "1";
        errors?: "0" | "1";
        days?: number;
        api_key?: string;
        workspace?: string;
        app?: string;
    }): Promise<{
        data: unknown[];
    }>;
}
declare class EmbeddingsResource {
    private readonly client;
    constructor(client: Nexus);
    create(body: {
        model?: string;
        input: string | string[];
    }): Promise<{
        data: Array<{
            embedding: number[];
            index: number;
        }>;
        model: string;
    }>;
}
declare class ImagesResource {
    private readonly client;
    constructor(client: Nexus);
    generate(body: {
        prompt: string;
        model?: string;
        size?: "1024x1024" | "1024x1536" | "1536x1024";
        quality?: "low" | "medium" | "high";
        n?: number;
    }): Promise<{
        data: Array<{
            b64_json?: string;
            url?: string;
        }>;
        id?: string;
        model?: string;
        cost?: number;
        price_version?: string;
    }>;
}
declare class AudioResource {
    private readonly client;
    constructor(client: Nexus);
    speech(body: {
        input: string;
        model?: string;
        voice?: string;
        response_format?: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
        speed?: number;
        instructions?: string;
    }): Promise<ArrayBuffer>;
    transcriptions(body: {
        file: Blob;
        filename?: string;
        model?: string;
    } | Record<string, unknown>): Promise<{
        text: string;
        id?: string;
        duration?: number;
        cost?: number;
    }>;
}
declare class ResponsesResource {
    private readonly client;
    constructor(client: Nexus);
    create(body: Record<string, unknown>): Promise<{
        id: string;
        object: "response";
        status: string;
        output: unknown[];
        usage?: unknown;
    }>;
}
declare class MessagesResource {
    private readonly client;
    constructor(client: Nexus);
    create(body: Record<string, unknown>): Promise<{
        id: string;
        type: "message";
        role: string;
        content: unknown[];
        stop_reason?: string;
    }>;
}
declare class VideosResource {
    private readonly client;
    constructor(client: Nexus);
    create(body: {
        prompt: string;
        model?: string;
    }): Promise<{
        id: string;
        status: string;
        generation_id?: string;
        polling_url?: string;
    }>;
    get(id: string): Promise<{
        data: unknown;
    }>;
}
declare class CompletionsResource {
    private readonly client;
    constructor(client: Nexus);
    create(body: Record<string, unknown> & {
        prompt?: string;
        model?: string;
    }): Promise<ChatCompletion>;
}
declare class KeysResource {
    private readonly client;
    constructor(client: Nexus);
    list(): Promise<{
        data: unknown[];
    }>;
    create(body?: {
        name?: string;
        limit?: number;
        is_management?: boolean;
        workspace_id?: string;
    }): Promise<{
        data: {
            key: string;
        };
    }>;
    rotate(id: string): Promise<{
        data: {
            key: string;
        };
    }>;
    update(body: {
        id: string;
        name?: string;
        disabled?: boolean;
        limit?: number | null;
    }): Promise<{
        data: unknown;
    }>;
    delete(id: string): Promise<{
        data: {
            success: boolean;
        };
    }>;
}
declare class ProvidersResource {
    private readonly client;
    constructor(client: Nexus);
    list(): Promise<{
        data: unknown[];
    }>;
    health(): Promise<{
        data: unknown;
    }>;
}
declare class FilesResource {
    private readonly client;
    constructor(client: Nexus);
    list(): Promise<{
        data: unknown[];
    }>;
    get(id: string): Promise<{
        data: unknown;
    }>;
    upload(file: Blob, filename?: string): Promise<{
        data: {
            id: string;
            filename: string;
            bytes: number;
        };
    }>;
    createUpload(input: {
        filename: string;
        mime?: string;
        bytes: number;
        sha256: string;
        workspace_id?: string | null;
    }): Promise<{
        data: {
            id: string;
            filename: string;
            bytes: number;
            status: "pending";
            storage_backend: "s3";
            sha256: string;
            upload: {
                strategy: "single";
                method: "PUT";
                url: string;
                headers: Record<string, string>;
                expires_at: string;
            } | {
                strategy: "multipart";
                part_size: number;
                part_count: number;
                parts_url: string;
                expires_at: string;
            };
        };
    }>;
    signUploadParts(id: string, parts: Array<{
        part_number: number;
        sha256: string;
    }>): Promise<{
        data: Array<{
            part_number: number;
            bytes: number;
            sha256: string;
            method: "PUT";
            url: string;
            headers: Record<string, string>;
            expires_in: number;
        }>;
    }>;
    listUploadParts(id: string): Promise<{
        data: Array<{
            part_number: number;
            bytes: number;
            sha256_base64: string;
        }>;
    }>;
    completeUpload(id: string): Promise<{
        data: unknown;
    }>;
    uploadArtifact(file: Blob, input: {
        filename: string;
        sha256: string;
        workspace_id?: string | null;
    }): Promise<{
        data: unknown;
    }>;
    delete(id: string): Promise<{
        data: {
            success: boolean;
        };
    }>;
}
declare class AnalyticsResource {
    private readonly client;
    constructor(client: Nexus);
    get(days?: number): Promise<{
        data: {
            totals: {
                requests: number;
                tokens: number;
                cost: number;
            };
            by_model: Array<{
                model: string;
                tokens: number;
                cost: number;
                requests: number;
            }>;
        };
    }>;
}
declare class PresetsResource {
    private readonly client;
    constructor(client: Nexus);
    list(): Promise<{
        data: unknown[];
    }>;
    create(body: Record<string, unknown>): Promise<{
        data: unknown;
    }>;
    delete(id: string): Promise<{
        data: {
            success: boolean;
        };
    }>;
}
declare class GuardrailsResource {
    private readonly client;
    constructor(client: Nexus);
    list(): Promise<{
        data: unknown[];
    }>;
    create(body: Record<string, unknown>): Promise<{
        data: unknown;
    }>;
    delete(id: string): Promise<{
        data: {
            success: boolean;
        };
    }>;
}
declare class ByokResource {
    private readonly client;
    constructor(client: Nexus);
    list(): Promise<{
        data: unknown[];
    }>;
    create(body: {
        provider: string;
        key: string;
    }): Promise<{
        data: unknown;
    }>;
    delete(id: string): Promise<{
        data: {
            success: boolean;
        };
    }>;
}
declare class WorkspacesResource {
    private readonly client;
    constructor(client: Nexus);
    list(): Promise<{
        data: unknown[];
    }>;
    create(body?: {
        name?: string;
        limit?: number;
        interval?: string;
    }): Promise<{
        data: unknown;
    }>;
    update(body: Record<string, unknown> & {
        id: string;
    }): Promise<{
        data: unknown;
    }>;
    delete(id: string): Promise<{
        data: {
            success: boolean;
        };
    }>;
}
declare class OrganizationResource {
    private readonly client;
    constructor(client: Nexus);
    get(): Promise<{
        data: unknown;
    }>;
    create(body: Record<string, unknown>): Promise<{
        data: unknown;
    }>;
    delete(id: string): Promise<{
        data: {
            success: boolean;
        };
    }>;
}
declare class ObservabilityResource {
    private readonly client;
    constructor(client: Nexus);
    list(): Promise<{
        data: unknown[];
    }>;
    create(body: {
        url: string;
        secret?: string;
    }): Promise<{
        data: unknown;
    }>;
    delete(id: string): Promise<{
        data: {
            success: boolean;
        };
    }>;
}
declare class RoutingResource {
    private readonly client;
    constructor(client: Nexus);
    preview(body: {
        model: string;
        messages?: Array<{
            role: string;
            content: string;
        }>;
        provider?: Record<string, unknown>;
    }): Promise<{
        data: {
            requested: string;
            mode: string;
            hops: Array<{
                model: string;
                adapter: string;
                wired: boolean;
                zdr: boolean;
            }>;
            note: string;
            guest?: boolean;
        };
    }>;
}
declare class StatusResource {
    private readonly client;
    constructor(client: Nexus);
    get(): Promise<{
        data?: Record<string, unknown>;
        providers?: Record<string, boolean>;
    }>;
}
declare class SharesResource {
    private readonly client;
    constructor(client: Nexus);
    create(body: {
        model: string;
        messages: Array<{
            role: string;
            content: string;
        }>;
        title?: string;
        stats?: Record<string, unknown> | null;
    }): Promise<{
        data: {
            id: string;
            url: string;
            title: string;
        };
    }>;
    get(id: string): Promise<{
        data: {
            id: string;
            title: string | null;
            payload: {
                model: string;
                messages: Array<{
                    role: string;
                    content: string;
                }>;
            };
        };
    }>;
    list(): Promise<{
        data: Array<{
            id: string;
            title: string | null;
            model: string;
            url: string;
            created_at: string;
        }>;
    }>;
    delete(id: string): Promise<{
        data: {
            id: string;
            deleted: boolean;
        };
    }>;
}
declare class OauthResource {
    private readonly client;
    constructor(client: Nexus);
    /** Describe PKCE flow (no auth required). */
    describe(): Promise<{
        data: {
            flow: string;
            steps: string[];
        };
    }>;
    /** Issue one-time code (requires user session / account bearer). */
    challenge(codeChallenge: string): Promise<{
        code: string;
    }>;
    /** Exchange code + verifier for sk-nx- key (shown once). */
    exchange(code: string, codeVerifier: string): Promise<{
        key: string;
    }>;
}
declare class DatasetsResource {
    private readonly client;
    readonly revisions: {
        list: (namespace: string, slug: string) => Promise<{
            data: unknown[];
        }>;
        create: (namespace: string, slug: string, body: DatasetRevisionRequest) => Promise<{
            data: unknown;
        }>;
    };
    readonly access: {
        list: (namespace: string, slug: string) => Promise<{
            data: unknown;
        }>;
        request: (namespace: string, slug: string) => Promise<{
            data: {
                status: string;
            };
        }>;
        decide: (namespace: string, slug: string, id: string, status: "approved" | "rejected") => Promise<{
            data: unknown;
        }>;
    };
    constructor(client: Nexus);
    private path;
    list(opts?: {
        q?: string;
        task?: string;
        tag?: string;
        mine?: boolean;
        limit?: number;
    }): Promise<{
        data: DatasetRepository[];
        meta: {
            count: number;
            scope: string;
        };
    }>;
    get(namespace: string, slug: string): Promise<{
        data: DatasetRepository & {
            access: unknown;
            revisions: unknown[];
        };
    }>;
    create(body: DatasetCreateRequest): Promise<{
        data: DatasetRepository;
    }>;
    update(namespace: string, slug: string, body: Partial<Omit<DatasetCreateRequest, "namespace" | "slug" | "workspace_id">>): Promise<{
        data: DatasetRepository;
    }>;
    delete(namespace: string, slug: string): Promise<{
        data: {
            id: string;
            deleted: boolean;
        };
    }>;
    download(namespace: string, slug: string, revision: string | number, path: string): Promise<ArrayBuffer>;
    models(opts?: {
        window?: "7d" | "30d" | "all";
    }): Promise<{
        data: Array<{
            model: string;
            tokens: number;
            requests: number;
            avg_latency_ms: number | null;
        }>;
        window: string;
    }>;
}
declare class SpacesResource {
    private readonly client;
    constructor(client: Nexus);
    private path;
    list(opts?: {
        q?: string;
        model?: string;
        mine?: boolean;
        limit?: number;
    }): Promise<{
        data: Space[];
        meta: {
            count: number;
            scope: string;
        };
    }>;
    get(namespace: string, slug: string): Promise<{
        data: Space & {
            access: unknown;
            recent_runs: unknown[];
        };
    }>;
    create(body: SpaceCreateRequest): Promise<{
        data: Space;
    }>;
    update(namespace: string, slug: string, body: Partial<Omit<SpaceCreateRequest, "namespace" | "slug" | "workspace_id">>): Promise<{
        data: Space;
    }>;
    delete(namespace: string, slug: string): Promise<{
        data: {
            id: string;
            deleted: boolean;
        };
    }>;
    run(namespace: string, slug: string, body: {
        prompt?: string;
        messages?: Array<{
            role: "user" | "assistant";
            content: string;
        }>;
    }): Promise<ChatCompletion>;
}
declare class AuthResource {
    private readonly client;
    constructor(client: Nexus);
    key(): Promise<{
        data: {
            label?: string | null;
            is_management?: boolean;
            limit?: number | null;
            usage?: number;
            limit_remaining?: number | null;
        };
    }>;
}
export {};
