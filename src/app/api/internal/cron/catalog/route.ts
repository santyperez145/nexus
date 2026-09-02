import { syncCatalog } from "@/lib/catalog/sync";
import { db, ensureDb, schema } from "@/lib/db";
import { id } from "@/lib/ids";

export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
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
