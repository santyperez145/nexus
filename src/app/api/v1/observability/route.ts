import { desc, eq, inArray } from "drizzle-orm";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { assertWorkspaceManager, canAccess, resolveOwnedWorkspace, userScope } from "@/lib/gateway/tenant";
import { db, schema } from "@/lib/db";
import { id } from "@/lib/ids";
import { assertPublicHttpUrl } from "@/lib/net/public-url";
import { newWebhookSecret, pingWebhookDestination } from "@/lib/observability/dispatch";

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
        .map((r) => ({
          ...r,
          config: {
            ...((r.config ?? {}) as object),
            secret: (r.config as { secret?: string } | null)?.secret
              ? `${String((r.config as { secret?: string }).secret).slice(0, 8)}…`
              : undefined,
            has_secret: Boolean((r.config as { secret?: string } | null)?.secret),
          },
        })),
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
      const config = (row.config ?? {}) as { url?: string; secret?: string };
      if (!config.url) return jsonError(Object.assign(new Error("url missing"), { status: 400 }));
      const result = await pingWebhookDestination({ url: config.url, secret: config.secret });
      return Response.json({ data: result });
    }

    const secret = body.secret === false ? undefined : newWebhookSecret();
    const url = String(body.url ?? body.config?.url ?? "");
    assertPublicHttpUrl(url);
    const workspaceId = await resolveOwnedWorkspace(auth, body.workspace_id);
    await assertWorkspaceManager(auth, workspaceId);
    const row = {
      id: id("obs"),
      userId: auth.userId,
      workspaceId,
      type: body.type ?? "webhook",
      name: body.name ?? "Webhook",
      config: {
        url,
        ...(secret ? { secret } : {}),
      },
    };
    await db.insert(schema.observabilityDestinations).values(row);
    return Response.json({
      data: {
        ...row,
        revealed_secret: secret ?? null,
        note: secret
          ? "Copiá el secret ahora: se firma cada delivery en x-nexus-signature (HMAC-SHA256)."
          : undefined,
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
    await db
      .update(schema.observabilityDestinations)
      .set({ deleted: true })
      .where(eq(schema.observabilityDestinations.id, idParam));
    return Response.json({ data: { success: true } });
  } catch (error) {
    return jsonError(error);
  }
}
