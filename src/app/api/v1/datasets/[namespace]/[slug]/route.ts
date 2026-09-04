import { authenticateOptionalRequest, authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { writeAudit } from "@/lib/gateway/audit";
import { invalidDatasetInput, updateDatasetSchema } from "@/lib/hub/datasets";
import {
  datasetAccess,
  deleteDatasetRepository,
  findDatasetRepository,
  listDatasetRevisions,
  publicDataset,
  updateDatasetRepository,
} from "@/lib/hub/repository-store";

type Context = { params: Promise<{ namespace: string; slug: string }> };

export async function GET(req: Request, { params }: Context) {
  try {
    const { namespace, slug } = await params;
    const auth = await authenticateOptionalRequest(req);
    const repository = await findDatasetRepository(namespace, slug);
    if (!repository) {
      throw Object.assign(new Error("dataset not found"), { status: 404, code: "not_found" });
    }
    const access = await datasetAccess(repository, auth);
    if (!access.metadata) {
      throw Object.assign(new Error("dataset not found"), { status: 404, code: "not_found" });
    }
    const revisions = access.content ? await listDatasetRevisions(repository.id) : [];
    return Response.json({
      data: {
        ...publicDataset(repository),
        access,
        revisions: revisions.map((revision) => ({
          revision: revision.revision,
          commit_sha: revision.commitSha,
          commit_message: revision.commitMessage,
          metadata: revision.metadata,
          created_at: revision.createdAt,
          files: revision.files.map((file) => ({
            id: file.fileId,
            path: file.path,
            bytes: file.size,
            mime: file.mime,
          })),
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
    const parsed = updateDatasetSchema.safeParse(await req.json());
    if (!parsed.success) throw invalidDatasetInput(parsed.error);
    const repository = await updateDatasetRepository(auth, namespace, slug, parsed.data);
    if (!repository) {
      throw Object.assign(new Error("dataset not found"), { status: 404, code: "not_found" });
    }
    await writeAudit(auth, "dataset.update", {
      resource: "dataset",
      resourceId: repository.id,
      headers: req.headers,
      meta: { fields: Object.keys(parsed.data) },
    });
    return Response.json({ data: publicDataset(repository) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(req: Request, { params }: Context) {
  try {
    const auth = await authenticateRequest(req);
    const { namespace, slug } = await params;
    const repository = await deleteDatasetRepository(auth, namespace, slug);
    await writeAudit(auth, "dataset.delete", {
      resource: "dataset",
      resourceId: repository.id,
      headers: req.headers,
      meta: { path: `${repository.namespace}/${repository.slug}` },
    });
    return Response.json({ data: { id: repository.id, deleted: true } });
  } catch (error) {
    return jsonError(error);
  }
}
