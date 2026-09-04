import { authenticateOptionalRequest, authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { writeAudit } from "@/lib/gateway/audit";
import { hubTenantAccess } from "@/lib/hub/datasets";
import {
  canReadHubSpace,
  deleteHubSpace,
  findHubSpace,
  listHubSpaceRuns,
  publicSpace,
  updateHubSpace,
} from "@/lib/hub/space-store";
import { invalidSpaceInput, updateSpaceSchema } from "@/lib/hub/spaces";

type Context = { params: Promise<{ namespace: string; slug: string }> };

export async function GET(req: Request, { params }: Context) {
  try {
    const auth = await authenticateOptionalRequest(req);
    const { namespace, slug } = await params;
    const space = await findHubSpace(namespace, slug);
    if (!space || !canReadHubSpace(space, auth)) {
      throw Object.assign(new Error("space not found"), { status: 404, code: "not_found" });
    }
    const manager = hubTenantAccess(auth, space);
    const runs = manager && auth ? await listHubSpaceRuns(auth, namespace, slug) : [];
    return Response.json({
      data: {
        ...publicSpace(space),
        access: { manager },
        recent_runs: runs.map((run) => ({
          id: run.id,
          generation_id: run.generationId,
          model: run.model,
          created_at: run.createdAt,
        })),
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(req: Request, { params }: Context) {
  try {
    const auth = await authenticateRequest(req);
    const { namespace, slug } = await params;
    const parsed = updateSpaceSchema.safeParse(await req.json());
    if (!parsed.success) throw invalidSpaceInput(parsed.error);
    const space = await updateHubSpace(auth, namespace, slug, parsed.data);
    if (!space) {
      throw Object.assign(new Error("space not found"), { status: 404, code: "not_found" });
    }
    await writeAudit(auth, "space.update", {
      resource: "space",
      resourceId: space.id,
      headers: req.headers,
      meta: { fields: Object.keys(parsed.data) },
    });
    return Response.json({ data: publicSpace(space) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(req: Request, { params }: Context) {
  try {
    const auth = await authenticateRequest(req);
    const { namespace, slug } = await params;
    const space = await deleteHubSpace(auth, namespace, slug);
    await writeAudit(auth, "space.delete", {
      resource: "space",
      resourceId: space.id,
      headers: req.headers,
      meta: { path: `${space.namespace}/${space.slug}` },
    });
    return Response.json({ data: { id: space.id, deleted: true } });
  } catch (error) {
    return jsonError(error);
  }
}
