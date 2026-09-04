import { allRuntimeModels } from "@/lib/catalog/runtime";
import { isModelExecutionReady } from "@/lib/catalog/presentation";

export async function GET() {
  const models = (await allRuntimeModels()).filter((m) => !m.id.startsWith("nexus/"));
  return Response.json({
    data: {
      count: models.length,
      executable: models.filter(isModelExecutionReady).length,
      reference_only: models.filter((model) => !isModelExecutionReady(model)).length,
    },
  });
}
