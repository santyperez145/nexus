import { authorizeCronRequest } from "@/lib/cron/authorize";
import { cleanupExpiredArtifactUploads } from "@/lib/files/store";

export const maxDuration = 60;

export async function GET(req: Request) {
  const authorization = authorizeCronRequest(req);
  if (!authorization.ok) {
    return Response.json({ error: authorization.error }, { status: authorization.status });
  }
  const result = await cleanupExpiredArtifactUploads();
  return Response.json({ ok: result.failed === 0, ...result }, { status: result.failed ? 503 : 200 });
}

export const POST = GET;
