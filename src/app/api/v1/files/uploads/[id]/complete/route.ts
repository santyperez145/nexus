import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { completeDirectUpload, publicFile } from "@/lib/files/store";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { writeAudit } from "@/lib/gateway/audit";
import { canAccess, canMutateResource } from "@/lib/gateway/tenant";

type Context = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Context) {
  try {
    const auth = await authenticateRequest(req);
    const { id } = await params;
    const [row] = await db.select().from(schema.files).where(eq(schema.files.id, id)).limit(1);
    if (!row || !canAccess(auth, row) || !(await canMutateResource(auth, row))) {
      throw Object.assign(new Error("Upload not found"), { status: 404, code: "not_found" });
    }
    const ready = await completeDirectUpload(row);
    await writeAudit(auth, "file.upload.complete", {
      resource: "file",
      resourceId: ready.id,
      headers: req.headers,
      meta: {
        bytes: ready.size,
        sha256: ready.checksumSha256,
        etag: ready.etag,
        workspace_id: ready.workspaceId,
      },
    });
    return Response.json({ data: publicFile(ready) });
  } catch (error) {
    return jsonError(error);
  }
}
