import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { APP_URL } from "@/lib/config";
import { corsModeForPath, credentialCorsHeaders, publicCorsHeaders } from "@/lib/cors";

function apply(headers: Headers, extra: Record<string, string>) {
  for (const [key, value] of Object.entries(extra)) headers.set(key, value);
}

export function proxy(request: NextRequest) {
  const mode = corsModeForPath(request.nextUrl.pathname);
  if (mode === "skip") return NextResponse.next();

  const cors =
    mode === "public" ? publicCorsHeaders(request) : credentialCorsHeaders(request, APP_URL);

  if (request.method === "OPTIONS") {
    if (!cors) return new NextResponse(null, { status: 403 });
    return new NextResponse(null, { status: 204, headers: cors });
  }

  const response = NextResponse.next();
  if (cors) apply(response.headers, cors);
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
