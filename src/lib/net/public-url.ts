import { lookup as dnsLookup } from "node:dns";
import { Agent, fetch as undiciFetch } from "undici";

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

function ipv6Words(host: string): number[] | null {
  if (!host.includes(":")) return null;
  const parts = host.toLowerCase().split("::");
  if (parts.length > 2) return null;
  const parseSide = (side: string) => {
    if (!side) return [] as number[];
    const chunks = side.split(":");
    const words: number[] = [];
    for (const chunk of chunks) {
      const dotted = ipv4Octets(chunk);
      if (dotted) {
        words.push((dotted[0] << 8) | dotted[1], (dotted[2] << 8) | dotted[3]);
        continue;
      }
      if (!/^[a-f0-9]{1,4}$/.test(chunk)) return null;
      words.push(Number.parseInt(chunk, 16));
    }
    return words;
  };
  const left = parseSide(parts[0]);
  const right = parseSide(parts[1] ?? "");
  if (!left || !right) return null;
  const missing = 8 - left.length - right.length;
  if ((parts.length === 1 && missing !== 0) || missing < 0) return null;
  return [...left, ...Array(missing).fill(0), ...right];
}

function ssrfError(message: string) {
  return Object.assign(new Error(message), { status: 400, code: "ssrf_blocked" });
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
    if (a === 192 && b === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a === 198 && b === 51 && v4[2] === 100) return true;
    if (a === 203 && b === 0 && v4[2] === 113) return true;
    if (a >= 224) return true;
  }

  if (host.includes(":")) {
    const words = ipv6Words(host);
    if (!words) return true;
    const mappedV4 =
      words.slice(0, 5).every((word) => word === 0) &&
      (words[5] === 0 || words[5] === 0xffff)
        ? `${words[6] >> 8}.${words[6] & 255}.${words[7] >> 8}.${words[7] & 255}`
        : null;
    if (mappedV4 && isBlockedHost(mappedV4)) return true;
    if (
      words.every((word) => word === 0) ||
      (words.slice(0, 7).every((word) => word === 0) && words[7] === 1) ||
      (words[0] & 0xfe00) === 0xfc00 ||
      (words[0] & 0xffc0) === 0xfe80 ||
      (words[0] & 0xff00) === 0xff00 ||
      (words[0] === 0x2001 && words[1] === 0x0db8)
    ) {
      return true;
    }
  }
  return false;
}

/** Resolve at socket-connect time so DNS rebinding cannot bypass the hostname check. */
const publicOnlyDispatcher = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      dnsLookup(hostname, { ...options, all: false }, (error, address, family) => {
        if (error) return callback(error, address, family);
        if (isBlockedHost(address)) {
          return callback(ssrfError("URL resolved to a non-public address"), address, family);
        }
        return callback(null, address, family);
      });
    },
  },
});

export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw Object.assign(new Error("Invalid URL"), { status: 400, code: "invalid_request" });
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw ssrfError("Only http(s) URLs are allowed");
  }
  if (url.username || url.password) {
    throw ssrfError("URLs with credentials are not allowed");
  }
  if (isBlockedHost(url.hostname)) {
    throw ssrfError("URL target is not a public host");
  }
  return url;
}

export async function fetchPublicUrl(raw: string, init?: RequestInit): Promise<Response> {
  const url = assertPublicHttpUrl(raw);
  const requestInit = {
    ...init,
    redirect: "error",
    signal: init?.signal ?? AbortSignal.timeout(10000),
    dispatcher: publicOnlyDispatcher,
  } as unknown as Parameters<typeof undiciFetch>[1];
  return undiciFetch(url, requestInit) as unknown as Promise<Response>;
}
