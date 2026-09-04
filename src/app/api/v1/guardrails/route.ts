import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { assertWorkspaceManager, canAccess, resolveOwnedWorkspace, userScope } from "@/lib/gateway/tenant";
import { id } from "@/lib/ids";
import { usdToMicros } from "@/lib/money";
import { z } from "zod";

const stringList = z.array(z.string().trim().min(1).max(160)).max(100).nullable().optional();
const createGuardrail = z.object({
  workspace_id: z.string().trim().min(1).max(160).nullable().optional(),
  name: z.string().trim().min(1).max(100).default("Default"),
  allowed_models: stringList,
  blocked_models: stringList,
  allowed_providers: z
    .array(z.string().trim().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/i))
    .max(50)
    .nullable()
    .optional(),
  max_cost: z.coerce.number().positive().max(10_000).nullable().optional(),
  prompt_injection: z.boolean().optional(),
  sensitive_info: z.boolean().optional(),
  enforce_zdr: z.boolean().optional(),
});

function unique(values?: string[] | null) {
  return values?.length ? [...new Set(values)] : null;
}

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const rows = await db.select().from(schema.guardrails).where(userScope(auth, schema.guardrails.userId, schema.guardrails.workspaceId));
    return Response.json({ data: rows });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const parsed = createGuardrail.safeParse(await req.json());
    if (!parsed.success) {
      throw Object.assign(new Error(parsed.error.issues[0]?.message ?? "Invalid guardrail"), {
        status: 400,
        code: "invalid_request",
      });
    }
    const body = parsed.data;
    const workspaceId = await resolveOwnedWorkspace(auth, body.workspace_id);
    await assertWorkspaceManager(auth, workspaceId);
    const row = {
      id: id("grd"),
      userId: auth.userId,
      workspaceId,
      name: body.name,
      allowedModels: unique(body.allowed_models),
      blockedModels: unique(body.blocked_models),
      allowedProviders: unique(body.allowed_providers),
      maxCostMicros: body.max_cost != null ? usdToMicros(Number(body.max_cost)) : null,
      promptInjection: Boolean(body.prompt_injection),
      sensitiveInfo: Boolean(body.sensitive_info),
      enforceZdr: Boolean(body.enforce_zdr),
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
    if (!row || !canAccess(auth, row)) {
      return jsonError(Object.assign(new Error("not found"), { status: 404 }));
    }
    await assertWorkspaceManager(auth, row.workspaceId);
    await db.delete(schema.guardrails).where(eq(schema.guardrails.id, idParam));
    return Response.json({ data: { success: true } });
  } catch (error) {
    return jsonError(error);
  }
}
