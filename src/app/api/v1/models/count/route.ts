import { allModels } from "@/lib/catalog";
import { isModelExecutionReady } from "@/lib/catalog/presentation";

export async function GET() {
  const models = allModels().filter((m) => !m.id.startsWith("nexus/"));
  return Response.json({
    data: {
      count: models.length,
      executable: models.filter(isModelExecutionReady).length,
      reference_only: models.filter((model) => !isModelExecutionReady(model)).length,
    },
  });
}
