import { eq } from "drizzle-orm";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { db, schema } from "@/lib/db";
import { id } from "@/lib/ids";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const owned = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.ownerId, auth.userId));
    return Response.json({ data: owned });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const body = await req.json();
    const row = {
      id: id("org"),
      name: body.name ?? "Organization",
      slug: String(body.slug ?? body.name ?? "org")
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-"),
      ownerId: auth.userId,
    };
    await db.insert(schema.organizations).values(row);
    await db.insert(schema.organizationMembers).values({
      id: id("om"),
      organizationId: row.id,
      userId: auth.userId,
      role: "owner",
    });
    return Response.json({ data: row });
  } catch (error) {
    return jsonError(error);
  }
}
