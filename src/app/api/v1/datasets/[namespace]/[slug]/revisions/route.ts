import { authenticateOptionalRequest, authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { writeAudit } from "@/lib/gateway/audit";
import { createRevisionSchema, invalidDatasetInput } from "@/lib/hub/datasets";
import {
  createDatasetRevision,
  datasetAccess,
  findDatasetRepository,
  listDatasetRevisions,
} from "@/lib/hub/repository-store";

type Context = { params: Promise<{ namespace: string; slug: string }> };

export async function GET(req: Request, { params }: Context) {
  try {
    const auth = await authenticateOptionalRequest(req);
    const { namespace, slug } = await params;
    const repository = await findDatasetRepository(namespace, slug);
    if (!repository) {
      throw Object.assign(new Error("dataset not found"), { status: 404, code: "not_found" });
    }
    const access = await datasetAccess(repository, auth);
    if (!access.metadata) {
      throw Object.assign(new Error("dataset not found"), { status: 404, code: "not_found" });
    }
    if (!access.content) {
      throw Object.assign(new Error("dataset access approval required"), {
        status: 403,
        code: "access_required",
      });
    }
    return Response.json({ data: await listDatasetRevisions(repository.id) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request, { params }: Context) {
  try {
    const auth = await authenticateRequest(req);
    const { namespace, slug } = await params;
    const parsed = createRevisionSchema.safeParse(await req.json());
    if (!parsed.success) throw invalidDatasetInput(parsed.error);
    const revision = await createDatasetRevision(auth, namespace, slug, parsed.data);
    await writeAudit(auth, "dataset.revision.create", {
      resource: "dataset_revision",
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
