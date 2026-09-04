import { authenticateOptionalRequest, authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { writeAudit } from "@/lib/gateway/audit";
import { createHubSpace, listHubSpaces, publicSpace } from "@/lib/hub/space-store";
import { createSpaceSchema, invalidSpaceInput } from "@/lib/hub/spaces";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const mine = url.searchParams.get("mine") === "1";
    const auth = await authenticateOptionalRequest(req);
    if (mine && !auth) {
      throw Object.assign(new Error("authentication required for private spaces"), {
        status: 401,
        code: "invalid_api_key",
      });
    }
    const requestedLimit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
    const rows = await listHubSpaces({
      auth,
      mine,
      query: url.searchParams.get("q") ?? undefined,
      model: url.searchParams.get("model") ?? undefined,
      limit: Number.isFinite(requestedLimit) ? requestedLimit : 50,
    });
    return Response.json({
      data: rows.map(publicSpace),
      meta: { count: rows.length, scope: mine ? "tenant" : "public" },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const parsed = createSpaceSchema.safeParse(await req.json());
    if (!parsed.success) throw invalidSpaceInput(parsed.error);
    const space = await createHubSpace(auth, parsed.data);
    await writeAudit(auth, "space.create", {
      resource: "space",
      resourceId: space.id,
      headers: req.headers,
      meta: { path: `${space.namespace}/${space.slug}`, model: space.model },
    });
    return Response.json({ data: publicSpace(space) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

