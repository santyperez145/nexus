import { z } from "zod";
import { initiateDirectUpload, publicFile, resolveFileTarget } from "@/lib/files/store";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { writeAudit } from "@/lib/gateway/audit";

const uploadSchema = z.object({
  filename: z.string().trim().min(1).max(512),
  mime: z.string().trim().min(1).max(255).default("application/octet-stream"),
  bytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  workspace_id: z.string().trim().min(1).max(128).nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const parsed = uploadSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw Object.assign(new Error(parsed.error.issues[0]?.message ?? "Invalid upload reservation"), {
        status: 400,
        code: "invalid_request",
      });
    }
    const { workspaceId } = await resolveFileTarget(auth, parsed.data.workspace_id);
    const reserved = await initiateDirectUpload(auth, {
      filename: parsed.data.filename,
      mime: parsed.data.mime,
      size: parsed.data.bytes,
      checksumSha256: parsed.data.sha256,
      workspaceId,
    });
    await writeAudit(auth, "file.upload.reserve", {
      resource: "file",
      resourceId: reserved.row.id,
      headers: req.headers,
      meta: {
        bytes: reserved.row.size,
        sha256: reserved.row.checksumSha256,
        workspace_id: workspaceId,
      },
    });
    return Response.json(
      {
        data: {
          ...publicFile(reserved.row),
          upload: {
            method: "PUT",
            url: reserved.signed.url,
            headers: reserved.signed.headers,
            expires_at: reserved.expiresAt,
          },
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
