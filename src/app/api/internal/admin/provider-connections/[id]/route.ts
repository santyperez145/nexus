import { getSession } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/config";
import { enforceControlPlaneOperationRateLimit } from "@/lib/control-plane/operation-rate-limit";
import { sessionAuthContext } from "@/lib/gateway/api-auth";
import { writeAudit } from "@/lib/gateway/audit";
import { jsonError } from "@/lib/gateway/errors";
import {
  updateProviderConnection,
  updateProviderConnectionSchema,
} from "@/lib/providers/onboarding";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Context) {
  try {
    const session = await getSession();
    if (!session?.user) throw Object.assign(new Error("Unauthorized"), { status: 401 });
    if (!isPlatformAdmin(session.user.email)) {
      throw Object.assign(new Error("Platform admin required"), { status: 403 });
    }
    const parsed = updateProviderConnectionSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw Object.assign(new Error("Invalid provider operation"), {
        status: 400,
        code: "invalid_request",
        details: parsed.error.flatten(),
      });
    }
    const operation = parsed.data.action === "probe" ? "provider_probe" : "provider_onboarding";
    const limited = await enforceControlPlaneOperationRateLimit(session.user.id, operation);
    if (limited) return limited;
    const { id } = await params;
    const result = await updateProviderConnection(id, session.user.id, parsed.data);
    const auth = await sessionAuthContext(session.user.id);
    await writeAudit(auth, `provider_connection.${parsed.data.action}`, {
      resource: "provider_connection",
      resourceId: id,
      headers: req.headers,
      meta: {
        action: parsed.data.action,
        ...(parsed.data.action === "activate"
          ? {
              zdrVerified: parsed.data.zdr_verified,
              noTrainingVerified: parsed.data.no_training_verified,
            }
          : {}),
      },
    });
    return Response.json({
      data:
        "count" in result
          ? result
          : {
              id: result.id,
              slug: result.slug,
              status: result.status,
              secret_hint: result.secretHint,
              last_probe_ok: result.lastProbeOk,
            },
    });
  } catch (error) {
    return jsonError(error);
  }
}
