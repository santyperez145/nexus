import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { APP_URL } from "@/lib/config";
import { corsModeForPath, credentialCorsHeaders, publicCorsHeaders } from "@/lib/cors";

function apply(headers: Headers, extra: Record<string, string>) {
  for (const [key, value] of Object.entries(extra)) headers.set(key, value);
}

export function proxy(request: NextRequest) {
  const requestId = request.headers.get("x-request-id")?.trim() || crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const mode = corsModeForPath(request.nextUrl.pathname);
  if (mode === "skip") {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("x-request-id", requestId);
    return response;
  }

  const cors =
    mode === "public" ? publicCorsHeaders(request) : credentialCorsHeaders(request, APP_URL);

  if (request.method === "OPTIONS") {
    if (!cors) return new NextResponse(null, { status: 403 });
    const preflight = new NextResponse(null, { status: 204, headers: cors });
    preflight.headers.set("x-request-id", requestId);
    return preflight;
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (cors) apply(response.headers, cors);
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
