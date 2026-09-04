import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import {
  assertWorkspaceManager,
  canAccess,
  canManageWorkspace,
  resolveOwnedWorkspace,
  userScope,
} from "@/lib/gateway/tenant";
import {
  isSupportedByokProvider,
  removeByokCredential,
  replaceByokCredential,
} from "@/lib/gateway/byok";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const rows = await db
      .select()
      .from(schema.byokCredentials)
      .where(userScope(auth, schema.byokCredentials.userId, schema.byokCredentials.workspaceId));
    const data = await Promise.all(
      rows
        .filter((r) => !r.deleted)
        .map(async (r) => ({
          id: r.id,
          provider: r.provider,
          label: r.label,
          workspace_id: r.workspaceId,
          created_at: r.createdAt,
          can_manage: r.workspaceId ? await canManageWorkspace(auth, r.workspaceId) : r.userId === auth.userId,
        })),
    );
    return Response.json({ data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const body = await req.json();
    const workspaceId = await resolveOwnedWorkspace(auth, body.workspace_id);
    await assertWorkspaceManager(auth, workspaceId);
    const provider = typeof body.provider === "string" ? body.provider.trim().toLowerCase() : "";
    const key = typeof body.key === "string" ? body.key.trim() : "";
    if (!isSupportedByokProvider(provider) || key.length < 8 || key.length > 4096) {
      return jsonError(Object.assign(new Error("valid provider and key are required"), { status: 400 }));
    }
    const { row, replaced } = await replaceByokCredential({
      auth,
      workspaceId,
      provider,
      key,
      label: String(body.label ?? provider).slice(0, 120),
      headers: req.headers,
    });
    return Response.json({
      data: {
        id: row.id,
        provider: row.provider,
        label: row.label,
        workspace_id: row.workspaceId,
        replaced,
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
      .from(schema.byokCredentials)
      .where(eq(schema.byokCredentials.id, idParam))
      .limit(1);
    if (!row || !canAccess(auth, row)) {
      return jsonError(Object.assign(new Error("not found"), { status: 404 }));
    }
    await assertWorkspaceManager(auth, row.workspaceId);
    const removed = await removeByokCredential({
      auth,
      credentialId: idParam,
      workspaceId: row.workspaceId,
      headers: req.headers,
    });
    if (!removed) {
      return jsonError(Object.assign(new Error("not found"), { status: 404 }));
    }
    return Response.json({ data: { success: true } });
  } catch (error) {
    return jsonError(error);
  }
}
