import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { authenticateOptionalRequest, jsonError } from "@/lib/gateway/api-auth";
import { artifactDownloadResponse } from "@/lib/files/download";
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
    const immutable = revision !== "main" && revision !== "latest";
    const response = await artifactDownloadResponse(resolved.file, {
      revision: resolved.revision.commitSha,
      etag: `${resolved.revision.commitSha}-${resolved.file.checksumSha256 ?? resolved.file.id}`,
      cacheControl:
        repository.visibility === "public" && !repository.gated && immutable
          ? "public, max-age=31536000, immutable"
          : "private, no-store",
    });
    await db
      .update(schema.hubRepositories)
      .set({ downloads: sql`${schema.hubRepositories.downloads} + 1` })
      .where(sql`${schema.hubRepositories.id} = ${repository.id}`);
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
