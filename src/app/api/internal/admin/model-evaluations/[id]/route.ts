import { getSession } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/config";
import { enforceControlPlaneOperationRateLimit } from "@/lib/control-plane/operation-rate-limit";
import { sessionAuthContext } from "@/lib/gateway/api-auth";
import { writeAudit } from "@/lib/gateway/audit";
import { jsonError } from "@/lib/gateway/errors";
import {
  invalidModelGovernanceInput,
  reviewModelEvaluation,
  reviewModelGovernanceSchema,
} from "@/lib/hub/model-governance";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Context) {
  try {
    const session = await getSession();
    if (!session?.user) throw Object.assign(new Error("Unauthorized"), { status: 401 });
    if (!isPlatformAdmin(session.user.email)) {
      throw Object.assign(new Error("Platform admin required"), { status: 403 });
    }
    const limited = await enforceControlPlaneOperationRateLimit(
      session.user.id,
      "model_governance_review",
    );
    if (limited) return limited;
    const parsed = reviewModelGovernanceSchema.safeParse(await req.json());
    if (!parsed.success) throw invalidModelGovernanceInput(parsed.error);
    const { id } = await params;
    const result = await reviewModelEvaluation({
      evaluationId: id,
      actorUserId: session.user.id,
      decision: parsed.data.decision,
      note: parsed.data.note,
    });
    const auth = await sessionAuthContext(session.user.id);
    await writeAudit(auth, "model_evaluation.review", {
      resource: "model_evaluation",
      resourceId: id,
      headers: req.headers,
      meta: { decision: parsed.data.decision, note: parsed.data.note },
    });
    return Response.json({ data: result });
  } catch (error) {
    return jsonError(error);
  }
}
