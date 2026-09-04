import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { authenticateOptionalRequest, jsonError } from "@/lib/gateway/api-auth";
import {
  findModelRepository,
  modelRepositoryAccess,
  resolveModelFile,
} from "@/lib/hub/model-repository-store";

type Context = {
  params: Promise<{ namespace: string; slug: string; revision: string; path: string[] }>;
};

export async function GET(req: Request, { params }: Context) {
  try {
    const auth = await authenticateOptionalRequest(req);
    const { namespace, slug, revision, path } = await params;
    const repository = await findModelRepository(namespace, slug);
    if (!repository) throw Object.assign(new Error("model repository not found"), { status: 404 });
    const access = await modelRepositoryAccess(repository, auth);
    if (!access.metadata) throw Object.assign(new Error("model repository not found"), { status: 404 });
    if (!access.content) {
      throw Object.assign(new Error("model repository access approval required"), {
        status: 403,
        code: "access_required",
      });
    }
    const resolved = await resolveModelFile(repository, revision, path.join("/"));
    if (!resolved.file.content) {
      throw Object.assign(new Error("model file content is unavailable"), {
        status: 410,
        code: "content_unavailable",
      });
    }
    await db
      .update(schema.hubRepositories)
      .set({ downloads: sql`${schema.hubRepositories.downloads} + 1` })
      .where(sql`${schema.hubRepositories.id} = ${repository.id}`);
    const bytes = new Uint8Array(Buffer.from(resolved.file.content, "base64"));
    const immutable = revision !== "main" && revision !== "latest";
    return new Response(bytes, {
      headers: {
        "Content-Type": resolved.file.mime || "application/octet-stream",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(resolved.file.filename)}`,
        "X-Nexus-Revision": resolved.revision.commitSha,
        ETag: `"${resolved.revision.commitSha}-${resolved.file.id}"`,
        "Cache-Control":
          repository.visibility === "public" && !repository.gated && immutable
            ? "public, max-age=31536000, immutable"
            : "private, no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
