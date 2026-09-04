import { authenticateOptionalRequest, authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { writeAudit } from "@/lib/gateway/audit";
import { createModelRevisionSchema, invalidModelRepositoryInput } from "@/lib/hub/model-repositories";
import {
  createModelRevision,
  findModelRepository,
  listModelRevisions,
  modelRepositoryAccess,
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
    const auth = await authenticateOptionalRequest(req);
    const repository = await repositoryFrom(params);
    const access = await modelRepositoryAccess(repository, auth);
    if (!access.metadata) throw Object.assign(new Error("model repository not found"), { status: 404 });
    if (!access.content) {
      throw Object.assign(new Error("model repository access approval required"), {
        status: 403,
        code: "access_required",
      });
    }
    return Response.json({ data: await listModelRevisions(repository.id) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request, { params }: Context) {
  try {
    const auth = await authenticateRequest(req);
    const { namespace, slug } = await params;
    const parsed = createModelRevisionSchema.safeParse(await req.json());
    if (!parsed.success) throw invalidModelRepositoryInput(parsed.error);
    const revision = await createModelRevision(auth, namespace, slug, parsed.data);
    await writeAudit(auth, "model_repository.revision.create", {
      resource: "model_repository_revision",
      resourceId: revision.id,
      headers: req.headers,
      meta: { namespace, slug, revision: revision.revision, files: revision.files.length },
    });
    return Response.json(
      {
        data: {
          revision: revision.revision,
          commit_sha: revision.commitSha,
          commit_message: revision.commitMessage,
          metadata: revision.metadata,
          files: revision.files.map((file) => ({ file_id: file.fileId, path: file.path })),
          created_at: revision.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
