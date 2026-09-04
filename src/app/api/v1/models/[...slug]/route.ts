import { findModel } from "@/lib/catalog";
import { authenticateOptionalRequest, authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { writeAudit } from "@/lib/gateway/audit";
import { listModelEvaluations } from "@/lib/hub/model-governance";
import { invalidModelRepositoryInput, updateModelRepositorySchema } from "@/lib/hub/model-repositories";
import {
  deleteModelRepository,
  findModelRepository,
  listModelRevisions,
  modelRepositoryAccess,
  publicModelRepository,
  updateModelRepository,
} from "@/lib/hub/model-repository-store";
import { isEndpointNoTrainingConfirmed, isEndpointZdrConfirmed } from "@/lib/providers/privacy";

function publicEndpoint(endpoint: NonNullable<ReturnType<typeof findModel>>["endpoints"][number]) {
  return {
    name: endpoint.adapter,
    tag: endpoint.adapter,
    provider_name: endpoint.adapter,
    adapter: endpoint.adapter,
    provider_model: endpoint.providerModel,
    pricing: endpoint.pricing,
    pricing_verified: endpoint.pricingVerified === true,
    free: endpoint.free === true,
    latency_ms: endpoint.latencyMs,
    throughput_tps: endpoint.throughputTps,
    zdr: isEndpointZdrConfirmed(endpoint),
    zdr_capable: Boolean(endpoint.zdr),
    no_training: isEndpointNoTrainingConfirmed(endpoint),
    uptime: endpoint.uptime,
    quantization: endpoint.quantization,
    verified: Boolean(endpoint.verified),
    metrics_estimated: endpoint.metricsEstimated !== false,
  };
}

type Context = { params: Promise<{ slug: string[] }> };

export async function GET(req: Request, ctx: Context) {
  const { slug } = await ctx.params;
  const wantsEndpoints = slug.at(-1) === "endpoints";
  const id = (wantsEndpoints ? slug.slice(0, -1) : slug).join("/");
  const model = findModel(id);
  if (!model) {
    if (wantsEndpoints || slug.length !== 2) {
      return Response.json({ error: { message: "Model not found" } }, { status: 404 });
    }
    try {
      const auth = await authenticateOptionalRequest(req);
      const repository = await findModelRepository(slug[0], slug[1]);
      if (!repository) throw Object.assign(new Error("model repository not found"), { status: 404 });
      const access = await modelRepositoryAccess(repository, auth);
      if (!access.metadata) throw Object.assign(new Error("model repository not found"), { status: 404 });
      const [revisions, evaluations] = await Promise.all([
        access.content ? listModelRevisions(repository.id) : Promise.resolve([]),
        listModelEvaluations(repository, access.manager),
      ]);
      return Response.json({
        data: {
          ...publicModelRepository(repository),
          ...(access.manager ? { workspace_id: repository.workspaceId } : {}),
          access,
          evaluations,
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
  if (wantsEndpoints) {
    return Response.json({
      data: {
        id: model.id,
        name: model.name,
        endpoints: model.endpoints.map(publicEndpoint),
      },
    });
  }
  return Response.json({
    data: {
      id: model.id,
      name: model.name,
      description: model.description,
      context_length: model.contextLength,
      pricing: model.pricing,
      architecture: model.architecture,
      supported_parameters: model.supportedParameters,
      endpoints: model.endpoints.map(publicEndpoint),
    },
  });
}

export async function PATCH(req: Request, ctx: Context) {
  try {
    const auth = await authenticateRequest(req);
    const { slug } = await ctx.params;
    if (slug.length !== 2) throw Object.assign(new Error("model repository not found"), { status: 404 });
    const parsed = updateModelRepositorySchema.safeParse(await req.json());
    if (!parsed.success) throw invalidModelRepositoryInput(parsed.error);
    const repository = await updateModelRepository(auth, slug[0], slug[1], parsed.data);
    if (!repository) throw Object.assign(new Error("model repository not found"), { status: 404 });
    await writeAudit(auth, "model_repository.update", {
      resource: "model_repository",
      resourceId: repository.id,
      headers: req.headers,
      meta: { fields: Object.keys(parsed.data) },
    });
    return Response.json({ data: publicModelRepository(repository) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(req: Request, ctx: Context) {
  try {
    const auth = await authenticateRequest(req);
    const { slug } = await ctx.params;
    if (slug.length !== 2) throw Object.assign(new Error("model repository not found"), { status: 404 });
    const repository = await deleteModelRepository(auth, slug[0], slug[1]);
    await writeAudit(auth, "model_repository.delete", {
      resource: "model_repository",
      resourceId: repository.id,
      headers: req.headers,
      meta: { path: `${repository.namespace}/${repository.slug}` },
    });
    return Response.json({ data: { id: repository.id, deleted: true } });
  } catch (error) {
    return jsonError(error);
  }
}
