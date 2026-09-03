import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { canAccess, canMutateResource, userScope } from "@/lib/gateway/tenant";
import { id } from "@/lib/ids";
import { slugify } from "@/lib/slug";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const rows = await db
      .select()
      .from(schema.presets)
      .where(userScope(auth, schema.presets.userId, schema.presets.workspaceId))
      .orderBy(desc(schema.presets.updatedAt));
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
      id: id("pre"),
      userId: auth.userId,
      workspaceId: auth.workspaceId ?? null,
      slug: slugify(String(body.slug ?? `preset-${Date.now()}`), "preset"),
      version: 1,
      config: {
        model: body.model,
        temperature: body.temperature,
        max_tokens: body.max_tokens,
        provider: body.provider,
        system: body.system,
      },
    };
    await db.insert(schema.presets).values(row);
    return Response.json({ data: row });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const presetId = new URL(req.url).searchParams.get("id");
    if (!presetId) return jsonError(Object.assign(new Error("id required"), { status: 400 }));
    const [row] = await db.select().from(schema.presets).where(eq(schema.presets.id, presetId)).limit(1);
    if (!row || !canAccess(auth, row) || !(await canMutateResource(auth, row))) {
      return jsonError(Object.assign(new Error("not found"), { status: 404 }));
    }
    await db.delete(schema.presets).where(eq(schema.presets.id, presetId));
    return Response.json({ data: { success: true } });
  } catch (error) {
    return jsonError(error);
  }
}
