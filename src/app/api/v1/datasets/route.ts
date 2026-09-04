import { authenticateOptionalRequest, authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { writeAudit } from "@/lib/gateway/audit";
import { createDatasetSchema, invalidDatasetInput } from "@/lib/hub/datasets";
import {
  createDatasetRepository,
  listDatasetRepositories,
  publicDataset,
} from "@/lib/hub/repository-store";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const mine = url.searchParams.get("mine") === "1";
    const auth = await authenticateOptionalRequest(req);
    if (mine && !auth) {
      throw Object.assign(new Error("authentication required for private datasets"), {
        status: 401,
        code: "invalid_api_key",
      });
    }
    const requestedLimit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
    const rows = await listDatasetRepositories({
      auth,
      mine,
      query: url.searchParams.get("q") ?? undefined,
      task: url.searchParams.get("task") ?? undefined,
      tag: url.searchParams.get("tag") ?? undefined,
      limit: Number.isFinite(requestedLimit) ? requestedLimit : 50,
    });
    return Response.json({
      data: rows.map(publicDataset),
      meta: { count: rows.length, scope: mine ? "tenant" : "public" },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const parsed = createDatasetSchema.safeParse(await req.json());
    if (!parsed.success) throw invalidDatasetInput(parsed.error);
    const repository = await createDatasetRepository(auth, parsed.data);
    await writeAudit(auth, "dataset.create", {
      resource: "dataset",
      resourceId: repository.id,
      headers: req.headers,
      meta: {
        path: `${repository.namespace}/${repository.slug}`,
        visibility: repository.visibility,
        gated: repository.gated,
      },
    });
    return Response.json({ data: publicDataset(repository) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
