import { currentRequestId } from "./request-id";

export function jsonError(error: unknown) {
  const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
  const message = error instanceof Error ? error.message : "Internal error";
  const explicitCode =
    typeof error === "object" && error && "code" in error && typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : undefined;
  const safe = Number.isFinite(status) && status >= 400 ? status : 500;
  const code =
    explicitCode ??
    (safe === 401
      ? "invalid_api_key"
      : safe === 402
        ? "insufficient_credits"
        : safe === 403
          ? "forbidden"
          : safe === 404
            ? "model_not_found"
            : safe === 400 || safe === 413
              ? "invalid_request"
              : safe === 429
                ? "rate_limited"
                : safe === 503
                  ? "provider_unwired"
                  : safe === 502
                    ? "provider_error"
                    : "internal_error");
  const metadata: Record<string, unknown> = {};
  if (typeof error === "object" && error && "provider" in error) {
    metadata.provider_name = (error as { provider?: string }).provider;
  }
  const headers: Record<string, string> = {};
  const requestId = currentRequestId();
  if (requestId) headers["x-request-id"] = requestId;
  if (safe === 429) {
    headers["Retry-After"] = "60";
    headers["X-RateLimit-Limit"] = "60";
    headers["X-RateLimit-Remaining"] = "0";
  }
  const type =
    safe === 401
      ? "authentication_error"
      : safe === 403
        ? "permission_error"
        : safe === 429
          ? "rate_limit_error"
          : safe >= 500
            ? "server_error"
            : "invalid_request_error";
  return Response.json({ error: { message, type, param: null, code, metadata } }, { status: safe, headers });
}

export function anthropicJsonError(error: unknown) {
  const base = jsonError(error);
  const status = base.status;
  const message = error instanceof Error ? error.message : "Internal error";
  const type =
    status === 401
      ? "authentication_error"
      : status === 403
        ? "permission_error"
        : status === 404
          ? "not_found_error"
          : status === 413
            ? "request_too_large"
            : status === 429
              ? "rate_limit_error"
              : status >= 500
                ? "api_error"
                : "invalid_request_error";
  const requestId = currentRequestId();
  return Response.json(
    { type: "error", error: { type, message }, ...(requestId ? { request_id: requestId } : {}) },
    { status, headers: base.headers },
  );
}
