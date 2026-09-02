import { allModels } from "@/lib/catalog";

export async function GET() {
  const models = allModels().filter((m) => !m.id.startsWith("nexus/"));
  return Response.json({ data: { count: models.length } });
}
