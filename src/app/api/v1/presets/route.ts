import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { id } from "@/lib/ids";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const rows = await db
      .select()
      .from(schema.presets)
      .where(eq(schema.presets.userId, auth.userId))
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
      slug: body.slug ?? `preset-${Date.now()}`,
      version: 1,
      config: {
        model: body.model,
        temperature: body.temperature,
        max_tokens: body.max_tokens,
        provider: body.provider,
      },
    };
    await db.insert(schema.presets).values(row);
    return Response.json({ data: row });
  } catch (error) {
    return jsonError(error);
  }
}
