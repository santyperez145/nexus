import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { writeAudit } from "@/lib/gateway/audit";
import { decideAccessSchema, invalidDatasetInput } from "@/lib/hub/datasets";
import {
  decideDatasetAccess,
  findDatasetRepository,
  listDatasetAccess,
  requestDatasetAccess,
} from "@/lib/hub/repository-store";

type Context = { params: Promise<{ namespace: string; slug: string }> };

async function repositoryFrom(params: Context["params"]) {
  const { namespace, slug } = await params;
  const repository = await findDatasetRepository(namespace, slug);
  if (!repository) {
    throw Object.assign(new Error("dataset not found"), { status: 404, code: "not_found" });
  }
  return repository;
}

export async function GET(req: Request, { params }: Context) {
  try {
    const auth = await authenticateRequest(req);
    const repository = await repositoryFrom(params);
    return Response.json({ data: await listDatasetAccess(auth, repository) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request, { params }: Context) {
  try {
    const auth = await authenticateRequest(req);
    const repository = await repositoryFrom(params);
    const result = await requestDatasetAccess(auth, repository);
    await writeAudit(auth, "dataset.access.request", {
      resource: "dataset",
      resourceId: repository.id,
      headers: req.headers,
    });
    return Response.json({ data: result }, { status: result.status === "owner" ? 200 : 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(req: Request, { params }: Context) {
  try {
    const auth = await authenticateRequest(req);
    const repository = await repositoryFrom(params);
    const parsed = decideAccessSchema.safeParse(await req.json());
    if (!parsed.success) throw invalidDatasetInput(parsed.error);
    const result = await decideDatasetAccess(
      auth,
      repository,
      parsed.data.id,
      parsed.data.status,
    );
    await writeAudit(auth, "dataset.access.decide", {
      resource: "dataset",
      resourceId: repository.id,
      headers: req.headers,
      meta: { grantId: result.id, status: result.status },
    });
    return Response.json({ data: result });
  } catch (error) {
    return jsonError(error);
  }
}
