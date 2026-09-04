import { getSession } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/config";
import { enforceControlPlaneOperationRateLimit } from "@/lib/control-plane/operation-rate-limit";
import { sessionAuthContext } from "@/lib/gateway/api-auth";
import { writeAudit } from "@/lib/gateway/audit";
import { jsonError } from "@/lib/gateway/errors";
import {
  createProviderConnection,
  createProviderConnectionSchema,
  listProviderConnectionsForAdmin,
} from "@/lib/providers/onboarding";

async function adminSession() {
  const session = await getSession();
  if (!session?.user) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  if (!isPlatformAdmin(session.user.email)) {
    throw Object.assign(new Error("Platform admin required"), { status: 403 });
  }
  return session.user;
}

export async function GET() {
  try {
    await adminSession();
    return Response.json({ data: await listProviderConnectionsForAdmin() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await adminSession();
    const limited = await enforceControlPlaneOperationRateLimit(
      user.id,
      "provider_onboarding",
    );
    if (limited) return limited;
    const parsed = createProviderConnectionSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw Object.assign(new Error("Invalid provider connection"), {
        status: 400,
        code: "invalid_request",
        details: parsed.error.flatten(),
      });
    }
    const connection = await createProviderConnection(user.id, parsed.data);
    const auth = await sessionAuthContext(user.id);
    await writeAudit(auth, "provider_connection.create", {
      resource: "provider_connection",
      resourceId: connection.id,
      headers: req.headers,
      meta: {
        slug: connection.slug,
        protocol: connection.protocol,
        baseUrl: connection.baseUrl,
      },
    });
    return Response.json(
      {
        data: {
          id: connection.id,
          slug: connection.slug,
          status: connection.status,
          secret_hint: connection.secretHint,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
