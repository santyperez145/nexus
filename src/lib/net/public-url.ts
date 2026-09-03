const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
  "metadata.google.internal",
  "metadata.google.internal.",
  "kubernetes.default.svc",
]);

function ipv4Octets(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const oct = m.slice(1).map(Number);
  if (oct.some((n) => n > 255)) return null;
  return oct;
}

export function isBlockedHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }
  if (host.includes("169.254.")) return true;

  const v4 = ipv4Octets(host);
  if (v4) {
    const [a, b] = v4;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 198 && (b === 18 || b === 19)) return true;
  }

  if (host.includes(":")) {
    const h = host.toLowerCase();
    if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  }
  return false;
}

export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw Object.assign(new Error("Invalid URL"), { status: 400, code: "invalid_request" });
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw Object.assign(new Error("Only http(s) URLs are allowed"), { status: 400, code: "ssrf_blocked" });
  }
  if (url.username || url.password) {
    throw Object.assign(new Error("URLs with credentials are not allowed"), { status: 400, code: "ssrf_blocked" });
  }
  if (isBlockedHost(url.hostname)) {
    throw Object.assign(new Error("URL target is not a public host"), { status: 400, code: "ssrf_blocked" });
  }
  return url;
}

export async function fetchPublicUrl(raw: string, init?: RequestInit): Promise<Response> {
  const url = assertPublicHttpUrl(raw);
  return fetch(url, {
    ...init,
    redirect: "error",
    signal: init?.signal ?? AbortSignal.timeout(10000),
  });
}
