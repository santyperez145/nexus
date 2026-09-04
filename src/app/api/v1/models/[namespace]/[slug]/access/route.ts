import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { writeAudit } from "@/lib/gateway/audit";
import { decideAccessSchema, invalidModelRepositoryInput } from "@/lib/hub/model-repositories";
import {
  decideModelAccess,
  findModelRepository,
  listModelAccess,
  requestModelAccess,
} from "@/lib/hub/model-repository-store";

type Context = { params: Promise<{ namespace: string; slug: string }> };

async function repositoryFrom(params: Context["params"]) {
  const { namespace, slug } = await params;
  const repository = await findModelRepository(namespace, slug);
  if (!repository) throw Object.assign(new Error("model repository not found"), { status: 404 });
  return repository;
}

export async function GET(req: Request, { params }: Context) {
  try {
    const auth = await authenticateRequest(req);
    return Response.json({ data: await listModelAccess(auth, await repositoryFrom(params)) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request, { params }: Context) {
  try {
    const auth = await authenticateRequest(req);
    const repository = await repositoryFrom(params);
    const result = await requestModelAccess(auth, repository);
    await writeAudit(auth, "model_repository.access.request", {
      resource: "model_repository",
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
    if (!parsed.success) throw invalidModelRepositoryInput(parsed.error);
    const result = await decideModelAccess(auth, repository, parsed.data.id, parsed.data.status);
    await writeAudit(auth, "model_repository.access.decide", {
      resource: "model_repository",
      resourceId: repository.id,
      headers: req.headers,
      meta: { grantId: result.id, status: result.status },
    });
    return Response.json({ data: result });
  } catch (error) {
    return jsonError(error);
  }
}
