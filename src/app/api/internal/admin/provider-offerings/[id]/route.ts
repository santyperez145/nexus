import { getSession } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/config";
import { enforceControlPlaneOperationRateLimit } from "@/lib/control-plane/operation-rate-limit";
import { sessionAuthContext } from "@/lib/gateway/api-auth";
import { writeAudit } from "@/lib/gateway/audit";
import { jsonError } from "@/lib/gateway/errors";
import {
  reviewProviderOffering,
  reviewProviderOfferingSchema,
} from "@/lib/providers/onboarding";

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
      "provider_onboarding",
    );
    if (limited) return limited;
    const parsed = reviewProviderOfferingSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw Object.assign(new Error("Invalid provider offering review"), {
        status: 400,
        code: "invalid_request",
        details: parsed.error.flatten(),
      });
    }
    const { id } = await params;
    const offering = await reviewProviderOffering(id, session.user.id, parsed.data);
    const auth = await sessionAuthContext(session.user.id);
    await writeAudit(auth, `provider_offering.${parsed.data.action}`, {
      resource: "provider_offering",
      resourceId: id,
      headers: req.headers,
      meta: {
        action: parsed.data.action,
        providerModelId: offering.providerModelId,
        canonicalModelId: offering.canonicalModelId,
        commissionBps: offering.commissionBps,
      },
    });
    return Response.json({
      data: {
        id: offering.id,
        status: offering.status,
        pricing_verified: offering.pricingVerified,
        canonical_model_id: offering.canonicalModelId,
        commission_bps: offering.commissionBps,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
