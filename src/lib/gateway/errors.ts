export function jsonError(error: unknown) {
  const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
  const message = error instanceof Error ? error.message : "Internal error";
  const safe = Number.isFinite(status) && status >= 400 ? status : 500;
  const code =
    safe === 401
      ? "invalid_api_key"
      : safe === 402
        ? "insufficient_credits"
        : safe === 403
          ? "guardrail_blocked"
          : safe === 404
            ? "model_not_found"
            : safe === 400 || safe === 413
              ? "invalid_request"
              : safe === 429
                ? "rate_limited"
                : safe === 502
                  ? "provider_error"
                  : "internal_error";
  const metadata: Record<string, unknown> = {};
  if (typeof error === "object" && error && "provider" in error) {
    metadata.provider_name = (error as { provider?: string }).provider;
  }
  const headers: Record<string, string> = {};
  if (safe === 429) {
    headers["Retry-After"] = "60";
    headers["X-RateLimit-Limit"] = "60";
    headers["X-RateLimit-Remaining"] = "0";
  }
  return Response.json({ error: { message, code, metadata } }, { status: safe, headers });
}
