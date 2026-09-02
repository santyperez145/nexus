import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { id } from "@/lib/ids";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const rows = await db.select().from(schema.workspaces).where(eq(schema.workspaces.userId, auth.userId));
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
      id: id("ws"),
      userId: auth.userId,
      name: body.name ?? "Workspace",
      slug: (body.slug ?? body.name ?? "workspace").toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      isDefault: false,
    };
    await db.insert(schema.workspaces).values(row);
    return Response.json({ data: row });
  } catch (error) {
    return jsonError(error);
  }
}
