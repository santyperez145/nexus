import { authenticateOptionalRequest, authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { writeAudit } from "@/lib/gateway/audit";
import {
  createModelEvaluation,
  createModelEvaluationSchema,
  invalidModelGovernanceInput,
  listModelEvaluations,
} from "@/lib/hub/model-governance";
import {
  findModelRepository,
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
    return Response.json({
      data: await listModelEvaluations(repository, access.manager),
      meta: { visibility: access.manager ? "manager" : "verified_only" },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request, { params }: Context) {
  try {
    const auth = await authenticateRequest(req);
    const { namespace, slug } = await params;
    const parsed = createModelEvaluationSchema.safeParse(await req.json());
    if (!parsed.success) throw invalidModelGovernanceInput(parsed.error);
    const evaluation = await createModelEvaluation(auth, namespace, slug, parsed.data);
    await writeAudit(auth, "model_evaluation.submit", {
      resource: "model_evaluation",
      resourceId: evaluation.id,
      headers: req.headers,
      meta: {
        namespace,
        slug,
        revision: parsed.data.revision,
        benchmark: parsed.data.benchmark,
        metric: parsed.data.metric,
      },
    });
    return Response.json({ data: evaluation }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
