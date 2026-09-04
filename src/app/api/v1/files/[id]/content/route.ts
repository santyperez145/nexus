import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { signArtifactDownload } from "@/lib/files/blob-store";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { canAccess } from "@/lib/gateway/tenant";

type Context = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Context) {
  try {
    const auth = await authenticateRequest(req);
    const { id } = await params;
    const [row] = await db.select().from(schema.files).where(eq(schema.files.id, id)).limit(1);
    if (!row || !canAccess(auth, row)) {
      throw Object.assign(new Error("File not found"), { status: 404, code: "not_found" });
    }
    if (row.status !== "ready") {
      throw Object.assign(new Error("File upload is not ready"), {
        status: 409,
        code: "artifact_not_ready",
      });
    }
    if (row.storageBackend === "s3" && row.storageKey) {
      const url = await signArtifactDownload({
        key: row.storageKey,
        filename: row.filename,
        mime: row.mime,
      });
      return Response.redirect(url, 307);
    }
    if (!row.content) {
      throw Object.assign(new Error("File content is unavailable"), {
        status: 410,
        code: "content_unavailable",
      });
    }
    const bytes = new Uint8Array(Buffer.from(row.content, "base64"));
    return new Response(bytes, {
      headers: {
        "Content-Type": row.mime,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
        ETag: `"sha256-${row.checksumSha256 ?? row.id}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
