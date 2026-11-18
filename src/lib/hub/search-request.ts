import { sha256 } from "@/lib/crypto";
import { authenticateOptionalRequest, jsonError } from "@/lib/gateway/api-auth";
import { bindRequestId } from "@/lib/gateway/request-id";
import { clientIpKey } from "@/lib/network/client-ip";
import {
  consumeFixedWindowRateLimit,
  rateLimitExceededResponse,
  rateLimitUnavailableResponse,
} from "@/lib/operation-rate-limit";
import { hubSearch, hubSearchTypes, type HubSearchType } from "./search";

function invalid(message: string): never {
  throw Object.assign(new Error(message), { status: 400, code: "invalid_request" });
}

function parseSearch(params: URLSearchParams) {
  const query = (params.get("q") ?? "").trim();
  if (query.length < 2 || query.length > 161 || /[\x00-\x1f\x7f]/.test(query)) {
    invalid("Ingresá entre 2 y 161 caracteres de búsqueda.");
  }
  const selected = params.get("type");
  const types = selected == null ? undefined : [...new Set(selected.split(","))];
  if (types?.some((type) => !hubSearchTypes.includes(type as HubSearchType))) {
    invalid("Tipo de recurso inválido.");
  }
  const limit = params.get("limit") ?? "20";
  if (!/^(?:[1-9]|[1-4]\d|50)$/.test(limit)) invalid("El límite debe estar entre 1 y 50.");
  return { query, types: types as HubSearchType[] | undefined, limit: Number(limit) };
}

async function run(req: Request) {
  const input = parseSearch(new URL(req.url).searchParams);
  // Charge the request before auth touches Postgres. Both browser entry points use this bucket.
  const rate = await consumeFixedWindowRateLimit(
    sha256(clientIpKey(req.headers)), "hub-search", { limit: 60, windowSeconds: 60 },
  ).catch(() => null);
  if (!rate) return rateLimitUnavailableResponse();
  if (!rate.allowed) return rateLimitExceededResponse(rate);

  const auth = await authenticateOptionalRequest(req);
  const result = await hubSearch({ ...input, auth });
  return Response.json({
    data: result.hits,
    meta: {
      query: result.query,
      types: result.types,
      counts: result.counts,
      count: result.hits.length,
      degraded: result.degraded,
      truncated: result.truncated,
    },
  });
}

export async function searchHubResponse(req: Request) {
  const requestId = bindRequestId(req);
  const response = await run(req).catch(jsonError);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Authorization, Cookie");
  response.headers.set("X-Request-Id", requestId);
  return response;
}
