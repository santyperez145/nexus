import type { ChatChunk, ChatCompletion, ChatRequest, NexusClientOptions } from "./types.js";
export declare class Nexus {
    #private;
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
    readonly responses: ResponsesResource;
    readonly messages: MessagesResource;
    readonly videos: VideosResource;
    readonly keys: KeysResource;
    readonly providers: ProvidersResource;
    readonly files: FilesResource;
    readonly analytics: AnalyticsResource;
    constructor(opts?: NexusClientOptions);
    request<T>(path: string, init?: {
        method?: string;
        body?: unknown;
        form?: FormData;
        query?: Record<string, string | number | undefined>;
        headers?: Record<string, string>;
        raw?: boolean;
    }): Promise<T>;
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
    constructor(client: Nexus);
    list(query?: {
        category?: string;
        output_modalities?: string;
        supported_parameters?: string;
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
    list(limit?: number): Promise<{
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
        size?: string;
        n?: number;
    }): Promise<{
        data: Array<{
            b64_json?: string;
            url?: string;
        }>;
    }>;
}
declare class AudioResource {
    private readonly client;
    constructor(client: Nexus);
    speech(body: {
        input: string;
        model?: string;
        voice?: string;
        response_format?: string;
    }): Promise<ArrayBuffer>;
    transcriptions(body: {
        file: Blob;
        filename?: string;
        model?: string;
    } | Record<string, unknown>): Promise<{
        text: string;
        id?: string;
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
    delete(id: string): Promise<{
        data: {
            success: boolean;
        };
    }>;
}
declare class AnalyticsResource {
    private readonly client;
    constructor(client: Nexus);
    get(): Promise<{
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
export {};
