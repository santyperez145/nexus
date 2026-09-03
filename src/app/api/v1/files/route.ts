import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { canAccess, canMutateResource, userScope } from "@/lib/gateway/tenant";
import { extractFileText } from "@/lib/files/extract";
import { id } from "@/lib/ids";

const MAX_BYTES = 8_000_000;

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const fileId = new URL(req.url).searchParams.get("id");
    if (fileId) {
      const [row] = await db.select().from(schema.files).where(eq(schema.files.id, fileId)).limit(1);
      if (!row || !canAccess(auth, row)) {
        return jsonError(Object.assign(new Error("not found"), { status: 404 }));
      }
      return Response.json({
        data: {
          id: row.id,
          filename: row.filename,
          bytes: row.size,
          mime: row.mime,
          created_at: row.createdAt,
          content: row.content,
          preview: previewText(row.content, row.mime, row.filename),
        },
      });
    }
    const rows = await db
      .select()
      .from(schema.files)
      .where(userScope(auth, schema.files.userId, schema.files.workspaceId))
      .orderBy(desc(schema.files.createdAt));
    return Response.json({
      data: rows.map((f) => ({
        id: f.id,
        filename: f.filename,
        bytes: f.size,
        mime: f.mime,
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
    if (file.size > MAX_BYTES) {
      return jsonError(Object.assign(new Error("file too large (max 8MB)"), { status: 413 }));
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
    return Response.json({ data: { id: row.id, filename: row.filename, bytes: row.size, mime: row.mime } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const fileId = new URL(req.url).searchParams.get("id");
    if (!fileId) return jsonError(Object.assign(new Error("id required"), { status: 400 }));
    const [row] = await db.select().from(schema.files).where(eq(schema.files.id, fileId)).limit(1);
    if (!row || !canAccess(auth, row) || !(await canMutateResource(auth, row))) {
      return jsonError(Object.assign(new Error("not found"), { status: 404 }));
    }
    await db.delete(schema.files).where(eq(schema.files.id, fileId));
    return Response.json({ data: { success: true } });
  } catch (error) {
    return jsonError(error);
  }
}

function previewText(b64: string | null, mime: string | null, filename = "file") {
  if (!b64) return null;
  try {
    return extractFileText(mime || "application/octet-stream", b64, filename).slice(0, 4000);
  } catch {
    return null;
  }
}
