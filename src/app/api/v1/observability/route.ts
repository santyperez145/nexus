import { desc, eq, inArray } from "drizzle-orm";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { assertWorkspaceManager, canAccess, resolveOwnedWorkspace, userScope } from "@/lib/gateway/tenant";
import { db, schema } from "@/lib/db";
import { id } from "@/lib/ids";
import { assertPublicHttpUrl } from "@/lib/net/public-url";
import { newWebhookSecret, pingWebhookDestination } from "@/lib/observability/dispatch";
import { enforceControlPlaneOperationRateLimit } from "@/lib/control-plane/operation-rate-limit";

const MAX_DESTINATION_NAME_LENGTH = 80;
const MAX_DESTINATION_URL_LENGTH = 2_048;

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const url = new URL(req.url);
    if (url.searchParams.get("deliveries") === "1") {
      const destinations = await db
        .select({ id: schema.observabilityDestinations.id })
        .from(schema.observabilityDestinations)
        .where(userScope(auth, schema.observabilityDestinations.userId, schema.observabilityDestinations.workspaceId));
      const destinationIds = destinations.map((row) => row.id);
      if (!destinationIds.length) return Response.json({ data: [] });
      const deliveries = await db
        .select({
          id: schema.webhookDeliveries.id,
          destinationId: schema.webhookDeliveries.destinationId,
          event: schema.webhookDeliveries.event,
          status: schema.webhookDeliveries.status,
          attempts: schema.webhookDeliveries.attempts,
          responseStatus: schema.webhookDeliveries.responseStatus,
          lastError: schema.webhookDeliveries.lastError,
          nextAttemptAt: schema.webhookDeliveries.nextAttemptAt,
          deliveredAt: schema.webhookDeliveries.deliveredAt,
          createdAt: schema.webhookDeliveries.createdAt,
        })
        .from(schema.webhookDeliveries)
        .where(inArray(schema.webhookDeliveries.destinationId, destinationIds))
        .orderBy(desc(schema.webhookDeliveries.createdAt))
        .limit(50);
      return Response.json({ data: deliveries });
    }
    const rows = await db
      .select()
      .from(schema.observabilityDestinations)
      .where(userScope(auth, schema.observabilityDestinations.userId, schema.observabilityDestinations.workspaceId));
    return Response.json({
      data: rows
        .filter((r) => !r.deleted)
        .map((r) => {
          const config = (r.config ?? {}) as { url?: string; secret?: string };
          return {
            ...r,
            config: {
              url: config.url,
              has_secret: Boolean(config.secret),
            },
          };
        }),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const body = await req.json();

    if (body.action === "ping" && body.id) {
      const [row] = await db
        .select()
        .from(schema.observabilityDestinations)
        .where(eq(schema.observabilityDestinations.id, String(body.id)))
        .limit(1);
      if (!row || !canAccess(auth, row) || row.deleted) {
        return jsonError(Object.assign(new Error("not found"), { status: 404 }));
      }
      await assertWorkspaceManager(auth, row.workspaceId);
      const limited = await enforceControlPlaneOperationRateLimit(
        `${auth.userId}:${row.id}`,
        "observability_ping",
      );
      if (limited) return limited;
      const config = (row.config ?? {}) as { url?: string; secret?: string };
      if (!config.url) return jsonError(Object.assign(new Error("url missing"), { status: 400 }));
      const result = await pingWebhookDestination({ url: config.url, secret: config.secret });
      return Response.json({ data: result });
    }

    const rawUrl = String(body.url ?? body.config?.url ?? "").trim();
    if (!rawUrl || rawUrl.length > MAX_DESTINATION_URL_LENGTH) {
      return jsonError(
        Object.assign(new Error("Ingresá una URL válida para el destino"), {
          status: 400,
          code: "invalid_url",
        }),
      );
    }
    const parsedUrl = assertPublicHttpUrl(rawUrl);
    if (parsedUrl.protocol !== "https:") {
      return jsonError(
        Object.assign(new Error("El destino debe usar HTTPS"), {
          status: 400,
          code: "https_required",
        }),
      );
    }
    const destinationUrl = parsedUrl.toString();
    const name = String(body.name ?? "Webhook").trim() || "Webhook";
    if (name.length > MAX_DESTINATION_NAME_LENGTH) {
      return jsonError(
        Object.assign(new Error("El nombre puede tener hasta 80 caracteres"), {
          status: 400,
          code: "invalid_name",
        }),
      );
    }
    const workspaceId = await resolveOwnedWorkspace(auth, body.workspace_id);
    await assertWorkspaceManager(auth, workspaceId);
    const limited = await enforceControlPlaneOperationRateLimit(
      auth.userId,
      "observability_destination",
    );
    if (limited) return limited;
    const secret = newWebhookSecret();
    const row = {
      id: id("obs"),
      userId: auth.userId,
      workspaceId,
      type: "webhook",
      name,
      config: {
        url: destinationUrl,
        secret,
      },
    };
    await db.insert(schema.observabilityDestinations).values(row);
    return Response.json({
      data: {
        id: row.id,
        userId: row.userId,
        workspaceId: row.workspaceId,
        type: row.type,
        name: row.name,
        config: { url: destinationUrl, has_secret: true },
        revealed_secret: secret,
        note: "Copiá el secreto ahora. No volverá a mostrarse.",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const idParam = new URL(req.url).searchParams.get("id");
    if (!idParam) return jsonError(Object.assign(new Error("id required"), { status: 400 }));
    const [row] = await db
      .select()
      .from(schema.observabilityDestinations)
      .where(eq(schema.observabilityDestinations.id, idParam))
      .limit(1);
    if (!row || !canAccess(auth, row)) {
      return jsonError(Object.assign(new Error("not found"), { status: 404 }));
    }
    await assertWorkspaceManager(auth, row.workspaceId);
    const config = (row.config ?? {}) as { url?: string };
    await db
      .update(schema.observabilityDestinations)
      .set({ deleted: true, config: { url: config.url } })
      .where(eq(schema.observabilityDestinations.id, idParam));
    return Response.json({ data: { success: true } });
  } catch (error) {
    return jsonError(error);
  }
}
