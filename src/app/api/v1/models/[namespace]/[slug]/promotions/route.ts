import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { writeAudit } from "@/lib/gateway/audit";
import {
  createModelPromotion,
  createModelPromotionSchema,
  invalidModelGovernanceInput,
  listModelPromotions,
} from "@/lib/hub/model-governance";
import {
  assertModelRepositoryMutation,
} from "@/lib/hub/model-repository-store";

type Context = { params: Promise<{ namespace: string; slug: string }> };

export async function GET(req: Request, { params }: Context) {
  try {
    const auth = await authenticateRequest(req);
    const { namespace, slug } = await params;
    const repository = await assertModelRepositoryMutation(auth, namespace, slug);
    return Response.json({ data: await listModelPromotions(repository) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request, { params }: Context) {
  try {
    const auth = await authenticateRequest(req);
    const { namespace, slug } = await params;
    const parsed = createModelPromotionSchema.safeParse(await req.json());
    if (!parsed.success) throw invalidModelGovernanceInput(parsed.error);
    const promotion = await createModelPromotion(auth, namespace, slug, parsed.data);
    await writeAudit(auth, "model_promotion.request", {
      resource: "model_promotion",
      resourceId: promotion.id,
      headers: req.headers,
      meta: {
        namespace,
        slug,
        revision: parsed.data.revision,
        runtimeModelId: parsed.data.runtime_model_id,
      },
    });
    return Response.json({ data: promotion }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
