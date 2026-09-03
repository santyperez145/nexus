import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { id } from "@/lib/ids";
import { usdToMicros } from "@/lib/money";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const rows = await db.select().from(schema.guardrails).where(eq(schema.guardrails.userId, auth.userId));
    return Response.json({ data: rows });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const body = await req.json();
    const row = {
      id: id("grd"),
      userId: auth.userId,
      workspaceId: body.workspace_id ?? auth.workspaceId,
      name: body.name ?? "Default",
      allowedModels: body.allowed_models ?? null,
      blockedModels: body.blocked_models ?? null,
      maxCostMicros: body.max_cost != null ? usdToMicros(Number(body.max_cost)) : null,
      promptInjection: Boolean(body.prompt_injection),
      sensitiveInfo: Boolean(body.sensitive_info),
    };
    await db.insert(schema.guardrails).values(row);
    return Response.json({ data: row });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const idParam = new URL(req.url).searchParams.get("id");
    if (!idParam) return jsonError(Object.assign(new Error("id required"), { status: 400 }));
    const [row] = await db.select().from(schema.guardrails).where(eq(schema.guardrails.id, idParam)).limit(1);
    if (!row || row.userId !== auth.userId) {
      return jsonError(Object.assign(new Error("not found"), { status: 404 }));
    }
    await db.delete(schema.guardrails).where(eq(schema.guardrails.id, idParam));
    return Response.json({ data: { success: true } });
  } catch (error) {
    return jsonError(error);
  }
}
