import { authenticateOptionalRequest, jsonError } from "@/lib/gateway/api-auth";
import { assertAnonymousReadRateLimit } from "@/lib/gateway/rate-limit";
import { hubSearch, hubSearchTypes, type HubSearchType } from "@/lib/hub/search";

function parseTypes(raw: string | null): HubSearchType[] {
  if (!raw) return [];
  const requested = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, hubSearchTypes.length);
  const invalid = requested.filter((value) => !hubSearchTypes.includes(value as HubSearchType));
  if (invalid.length) {
    throw Object.assign(new Error(`unknown search type: ${invalid[0]}`), {
      status: 400,
      code: "invalid_request",
    });
  }
  return requested as HubSearchType[];
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const auth = await authenticateOptionalRequest(req);
    if (!auth) await assertAnonymousReadRateLimit(req.headers, "search");
    const requestedLimit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
    const result = await hubSearch({
      auth,
      query: url.searchParams.get("q") ?? "",
      types: parseTypes(url.searchParams.get("type")),
      limit: Number.isFinite(requestedLimit) ? requestedLimit : 20,
    });
    return Response.json({
      data: result.hits,
      meta: {
        query: result.query,
        types: result.types,
        counts: result.counts,
        count: result.hits.length,
        degraded: result.degraded,
        scope: auth ? "tenant" : "public",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
