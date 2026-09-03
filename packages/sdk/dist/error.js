export class NexusError extends Error {
    status;
    code;
    metadata;
    constructor(message, opts) {
        super(message);
        this.name = "NexusError";
        this.status = opts.status;
        this.code = opts.code ?? "internal_error";
        this.metadata = opts.metadata ?? {};
    }
}
