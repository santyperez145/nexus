export class NexusError extends Error {
  readonly status: number;
  readonly code: string;
  readonly metadata: Record<string, unknown>;

  constructor(message: string, opts: { status: number; code?: string; metadata?: Record<string, unknown> }) {
    super(message);
    this.name = "NexusError";
    this.status = opts.status;
    this.code = opts.code ?? "internal_error";
    this.metadata = opts.metadata ?? {};
  }
}
