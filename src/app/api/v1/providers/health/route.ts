import { db, ensureDb, schema } from "@/lib/db";
import { providerSnapshot } from "@/lib/gateway/health";

export async function GET() {
  await ensureDb();
  const live = await providerSnapshot();
  const persisted = await db.select().from(schema.providerHealth);
  return Response.json({ data: { circuits: live, probes: persisted } });
}
