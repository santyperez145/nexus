const LOCAL_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3003",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3003",
];

const HOST_WILDCARDS = ["*.vercel.app", "*.up.railway.app", "*.fly.dev"];

const ALLOW_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD";
const ALLOW_HEADERS = [
  "Authorization",
  "Content-Type",
  "X-Request-Id",
  "X-API-Key",
  "HTTP-Referer",
  "X-Title",
  "X-Requested-With",
  "OpenAI-Beta",
  "OpenAI-Organization",
  "anthropic-version",
  "x-stainless-os",
  "x-stainless-lang",
  "x-stainless-package-version",
  "x-stainless-runtime",
  "x-stainless-runtime-version",
  "x-stainless-arch",
  "x-stainless-retry-count",
].join(", ");

function extraOrigins() {
  return (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function trustedAuthOrigins(appUrl: string) {
  const fromApp = (() => {
    try {
      return [new URL(appUrl).origin];
    } catch {
      return [];
    }
  })();
  return [...new Set([...fromApp, ...LOCAL_ORIGINS, ...HOST_WILDCARDS, ...extraOrigins()])];
}

export function isTrustedOrigin(origin: string, appUrl: string) {
  if (!origin) return false;
  if (trustedAuthOrigins(appUrl).includes(origin)) return true;
  let host = "";
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  if (host === "localhost" || host.startsWith("localhost:") || host.startsWith("127.0.0.1")) {
    return true;
  }
  return HOST_WILDCARDS.some((pattern) => {
    const suffix = pattern.slice(1);
    return host.endsWith(suffix) && host.length > suffix.length;
  });
}

function requestedHeaders(req: Request) {
  return req.headers.get("access-control-request-headers") ?? ALLOW_HEADERS;
}

export function publicCorsHeaders(req: Request) {
  const origin = req.headers.get("origin");
  const allowOrigin = origin && /^https?:\/\//i.test(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": ALLOW_METHODS,
    "Access-Control-Allow-Headers": requestedHeaders(req),
    "Access-Control-Max-Age": "86400",
    "Access-Control-Expose-Headers": "X-Request-Id, X-Title",
    Vary: "Origin",
  };
}

export function credentialCorsHeaders(req: Request, appUrl: string) {
  const origin = req.headers.get("origin") ?? "";
  if (!isTrustedOrigin(origin, appUrl)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": ALLOW_METHODS,
    "Access-Control-Allow-Headers": requestedHeaders(req),
    "Access-Control-Max-Age": "86400",
    "Access-Control-Expose-Headers": "X-Request-Id, X-Title",
    Vary: "Origin",
  };
}

export function corsModeForPath(pathname: string): "public" | "credentialed" | "skip" {
  if (pathname.startsWith("/api/webhooks")) return "skip";
  if (pathname.startsWith("/api/v1") || pathname === "/v1" || pathname.startsWith("/v1/")) {
    return "public";
  }
  if (pathname.startsWith("/api/auth") || pathname.startsWith("/api/internal")) return "credentialed";
  if (pathname.startsWith("/api/")) return "public";
  return "skip";
}
