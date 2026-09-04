import type { AuthContext } from "./types";

const GUEST_PATHS = [
  "/api/v1/chat/completions",
  "/api/v1/completions",
  "/api/v1/responses",
  "/api/v1/messages",
  "/api/v1/routing/preview",
];

const MANAGEMENT_PATHS = [
  "/api/v1/keys",
  "/api/v1/byok",
  "/api/v1/models",
  "/api/v1/datasets",
  "/api/v1/spaces",
  "/api/v1/files",
  "/api/v1/guardrails",
  "/api/v1/observability",
  "/api/v1/organization",
  "/api/v1/workspaces",
  "/api/v1/oauth",
  "/api/v1/presets",
  "/api/v1/shares",
];

const INFERENCE_PATHS = [
  "/api/v1/chat/completions",
  "/api/v1/completions",
  "/api/v1/responses",
  "/api/v1/messages",
  "/api/v1/embeddings",
  "/api/v1/rerank",
  "/api/v1/images/generations",
  "/api/v1/audio/speech",
  "/api/v1/audio/transcriptions",
  "/api/v1/videos",
];

const RESOURCE_PATHS = [
  ["/api/v1/analytics", "activity"],
  ["/api/v1/generation", "activity"],
  ["/api/v1/generations", "activity"],
  ["/api/v1/credits", "billing"],
  ["/api/v1/keys", "keys"],
  ["/api/v1/byok", "byok"],
  ["/api/v1/models", "models"],
  ["/api/v1/datasets", "datasets"],
  ["/api/v1/spaces", "spaces"],
  ["/api/v1/files", "files"],
  ["/api/v1/guardrails", "guardrails"],
  ["/api/v1/observability", "observability"],
  ["/api/v1/organization", "organizations"],
  ["/api/v1/workspaces", "workspaces"],
  ["/api/v1/oauth", "oauth"],
  ["/api/v1/presets", "presets"],
  ["/api/v1/shares", "shares"],
] as const;

const MANAGEMENT_SCOPES = new Set([
  "activity:read",
  "billing:read",
  "keys:read",
  "keys:write",
  "byok:read",
  "byok:write",
  "models:read",
  "models:write",
  "datasets:read",
  "datasets:write",
  "spaces:read",
  "spaces:write",
  "files:read",
  "files:write",
  "guardrails:read",
  "guardrails:write",
  "observability:read",
  "observability:write",
  "organizations:read",
  "organizations:write",
  "workspaces:read",
  "workspaces:write",
  "oauth:read",
  "oauth:write",
  "presets:read",
  "presets:write",
  "shares:read",
  "shares:write",
]);

export function defaultScopes(isManagement: boolean) {
  return isManagement ? [...MANAGEMENT_SCOPES] : ["inference:write"];
}

export function normalizeApiKeyScopes(raw: unknown, isManagement: boolean) {
  if (!Array.isArray(raw)) return defaultScopes(isManagement);
  const requested = [...new Set(raw.map(String))];
  const allowed = isManagement ? MANAGEMENT_SCOPES : new Set(["inference:write"]);
  if (!requested.length || requested.some((scope) => !allowed.has(scope))) {
    throw deny("Invalid API key scopes", 400, "invalid_request");
  }
  return requested;
}

export function scopeAllows(granted: string[] | undefined, required: string) {
  const scopes = granted ?? [];
  const resource = required.split(":")[0];
  return scopes.includes("*") || scopes.includes(required) || scopes.includes(`${resource}:*`);
}

function pathnameOf(req: Request) {
  try {
    const raw = new URL(req.url).pathname.replace(/\/$/, "") || "/";
    // The standalone Hono data plane is mounted at /v1 while Next.js exposes
    // the same handlers at /api/v1. Normalize before applying one ACL policy.
    return raw === "/v1" || raw.startsWith("/v1/") ? `/api${raw}` : raw;
  } catch {
    return "";
  }
}

function matches(path: string, prefixes: string[]) {
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

export function isGuestInferencePath(req: Request) {
  return matches(pathnameOf(req), GUEST_PATHS);
}

export function isManagementPath(req: Request) {
  const path = pathnameOf(req);
  if (/^\/api\/v1\/spaces\/[^/]+\/[^/]+\/run$/.test(path)) return false;
  if (path === "/api/v1/models" || path.startsWith("/api/v1/models/")) {
    if (req.method !== "GET" && req.method !== "HEAD") return true;
    if (path.endsWith("/access")) return true;
    try {
      return new URL(req.url).searchParams.get("mine") === "1";
    } catch {
      return false;
    }
  }
  return matches(path, MANAGEMENT_PATHS);
}

export function isInferencePath(req: Request) {
  const path = pathnameOf(req);
  return matches(path, INFERENCE_PATHS) || /^\/api\/v1\/spaces\/[^/]+\/[^/]+\/run$/.test(path);
}

export function requiredScope(req: Request) {
  if (isInferencePath(req) || pathnameOf(req) === "/api/v1/routing/preview") {
    return "inference:write";
  }
  const path = pathnameOf(req);
  if ((path === "/api/v1/models" || path.startsWith("/api/v1/models/")) && !isManagementPath(req)) {
    return path === "/api/v1/models" || path.endsWith("/endpoints") ? null : "models:read";
  }
  const resource = RESOURCE_PATHS.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1];
  if (!resource) return null;
  const action = req.method === "GET" || req.method === "HEAD" ? "read" : "write";
  return `${resource}:${action}`;
}

export function deny(message: string, status = 403, code = "forbidden") {
  return Object.assign(new Error(message), { status, code });
}

export function assertNotGuest(auth: AuthContext) {
  if (auth.guest) throw deny("Guest access is limited to the local playground", 401, "invalid_api_key");
}

export function enforcePathPolicy(req: Request, auth: AuthContext) {
  if (auth.guest && !isGuestInferencePath(req)) {
    throw deny("Guest header is not accepted on this route", 401, "invalid_api_key");
  }
  if (auth.guest && isManagementPath(req)) {
    throw deny("Guest cannot access account APIs", 401, "invalid_api_key");
  }
  if (isManagementPath(req)) {
    if (auth.guest) throw deny("Guest cannot access account APIs", 401, "invalid_api_key");
    if (auth.apiKeyId && !auth.isManagement) {
      throw deny("Management API key required (sk-nx-mgmt-). Inference keys cannot manage keys, BYOK or tenants.");
    }
  }
  if (isInferencePath(req) && !auth.guest && auth.apiKeyId && auth.isManagement) {
    throw deny("Management keys cannot run inference. Use an inference key (sk-nx-).");
  }
  const required = requiredScope(req);
  const scopes = auth.scopes ?? defaultScopes(auth.isManagement);
  if (required && !scopeAllows(scopes, required)) {
    throw deny(`API key is missing scope ${required}`);
  }
}

export function workspaceClause<T extends { workspaceId?: string | null }>(
  auth: AuthContext,
  rows: T[],
): T[] {
  if (!auth.workspaceId) return rows;
  return rows.filter((r) => !r.workspaceId || r.workspaceId === auth.workspaceId);
}
