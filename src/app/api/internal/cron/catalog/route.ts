import { syncCatalog } from "@/lib/catalog/sync";
import { authorizeCronRequest } from "@/lib/cron/authorize";
import { db, ensureDb, schema } from "@/lib/db";
import { id } from "@/lib/ids";

export const maxDuration = 60;

export async function GET(req: Request) {
  const authorization = authorizeCronRequest(req);
  if (!authorization.ok) {
    return Response.json({ error: authorization.error }, { status: authorization.status });
  }
  const result = await syncCatalog();
  await ensureDb();
  await db.insert(schema.catalogSnapshots).values({
    id: id("cat"),
    source: result.source,
    modelCount: result.count,
  });
  return Response.json(result);
}

export const POST = GET;
