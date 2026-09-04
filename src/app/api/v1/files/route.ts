import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { deleteArtifact } from "@/lib/files/blob-store";
import { extractFileText } from "@/lib/files/extract";
import {
  createInlineFile,
  publicFile,
  resolveFileTarget,
  storageUsage,
} from "@/lib/files/store";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { writeAudit } from "@/lib/gateway/audit";
import { canAccess, canMutateResource } from "@/lib/gateway/tenant";
import { fileReferencedByHubRevision } from "@/lib/hub/repository-store";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const params = new URL(req.url).searchParams;
    const fileId = params.get("id");
    if (fileId) {
      const [row] = await db.select().from(schema.files).where(eq(schema.files.id, fileId)).limit(1);
      if (!row || !canAccess(auth, row)) {
        return jsonError(Object.assign(new Error("not found"), { status: 404 }));
      }
      return Response.json({
        data: {
          ...publicFile(row),
          content: row.storageBackend === "database" ? row.content : null,
          preview:
            row.status === "ready" && row.storageBackend === "database"
              ? previewText(row.content, row.mime, row.filename)
              : null,
          download_url: row.status === "ready" ? `/api/v1/files/${row.id}/content` : null,
        },
      });
    }

    const target = await resolveFileTarget(auth, params.get("workspace_id"));
    const rows = await db
      .select()
      .from(schema.files)
      .where(
        target.workspaceId
          ? eq(schema.files.workspaceId, target.workspaceId)
          : and(eq(schema.files.userId, auth.userId), isNull(schema.files.workspaceId)),
      )
      .orderBy(desc(schema.files.createdAt));
    const usage = await storageUsage(auth, target.workspaceId);
    return Response.json({
      data: rows.map(publicFile),
      meta: {
        storage: {
          used_bytes: usage.usedBytes,
          quota_bytes: usage.quotaBytes,
          available_bytes: Math.max(0, usage.quotaBytes - usage.usedBytes),
          direct_upload: usage.directUpload,
          inline_max_bytes: usage.inlineMaxBytes,
          direct_max_bytes: usage.directMaxBytes,
          workspace_id: usage.workspaceId,
        },
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const form = await req.formData();
    const upload = form.get("file");
    if (!(upload instanceof File)) {
      return jsonError(Object.assign(new Error("file required"), { status: 400 }));
    }
    const { workspaceId } = await resolveFileTarget(auth, form.get("workspace_id"));
    const row = await createInlineFile(auth, {
      filename: upload.name || "file",
      mime: upload.type || "application/octet-stream",
      bytes: new Uint8Array(await upload.arrayBuffer()),
      workspaceId,
    });
    await writeAudit(auth, "file.upload", {
      resource: "file",
      resourceId: row.id,
      headers: req.headers,
      meta: {
        bytes: row.size,
        storage_backend: row.storageBackend,
        sha256: row.checksumSha256,
        workspace_id: workspaceId,
      },
    });
    return Response.json({ data: publicFile(row) }, { status: 201 });
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
    if (await fileReferencedByHubRevision(row.id)) {
      return jsonError(
        Object.assign(new Error("file belongs to an immutable Hub revision"), {
          status: 409,
          code: "resource_in_use",
        }),
      );
    }
    if (row.storageBackend === "s3" && row.storageKey) await deleteArtifact(row.storageKey);
    await db.delete(schema.files).where(eq(schema.files.id, fileId));
    await writeAudit(auth, "file.delete", {
      resource: "file",
      resourceId: row.id,
      headers: req.headers,
      meta: { bytes: row.size, storage_backend: row.storageBackend, workspace_id: row.workspaceId },
    });
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
