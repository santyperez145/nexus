export declare class NexusError extends Error {
    readonly status: number;
    readonly code: string;
    readonly metadata: Record<string, unknown>;
    constructor(message: string, opts: {
        status: number;
        code?: string;
        metadata?: Record<string, unknown>;
    });
}
