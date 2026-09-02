import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { id } from "@/lib/ids";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const rows = await db.select().from(schema.files).where(eq(schema.files.userId, auth.userId));
    return Response.json({
      data: rows.map((f) => ({
        id: f.id,
        filename: f.filename,
        bytes: f.size,
        purpose: "assistants",
        created_at: f.createdAt,
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return jsonError(Object.assign(new Error("file required"), { status: 400 }));
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const row = {
      id: id("file"),
      userId: auth.userId,
      workspaceId: auth.workspaceId,
      filename: file.name,
      mime: file.type || "application/octet-stream",
      size: file.size,
      content: buf.toString("base64"),
    };
    await db.insert(schema.files).values(row);
    return Response.json({ data: { id: row.id, filename: row.filename, bytes: row.size } });
  } catch (error) {
    return jsonError(error);
  }
}
