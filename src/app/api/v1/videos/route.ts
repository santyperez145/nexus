import { eq } from "drizzle-orm";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { resolveByokKey } from "@/lib/gateway/byok";
import { db, schema } from "@/lib/db";
import { id } from "@/lib/ids";
import { startVideoJob } from "@/lib/media/upstream";

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const body = await req.json();
    const prompt = String(body.prompt ?? "");
    const model = body.model ?? "nexus/video";
    const falKey = await resolveByokKey(auth.userId, "fal");
    const replicateToken = await resolveByokKey(auth.userId, "replicate");
    const live = await startVideoJob({ prompt, model, falKey, replicateToken });
    const row = {
      id: id("vid"),
      userId: auth.userId,
      model,
      prompt,
      status: live && "data" in live && !("error" in live) ? "processing" : live ? "failed" : "completed",
      resultUrl: null as string | null,
    };
    if (live && "data" in live && live.data && typeof live.data === "object") {
      const data = live.data as { video?: { url?: string }; url?: string; output?: string; urls?: { get?: string } };
      row.resultUrl = data.video?.url ?? data.url ?? data.output ?? data.urls?.get ?? null;
      if (row.resultUrl) row.status = "completed";
    }
    await db.insert(schema.videoJobs).values(row);
    return Response.json({
      id: row.id,
      status: row.status,
      model: row.model,
      polling_url: `/api/v1/videos?id=${row.id}`,
      provider: live?.provider ?? "local",
      warning: live ? undefined : "Cableá FAL_KEY o REPLICATE_API_TOKEN para video real",
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const jobId = new URL(req.url).searchParams.get("id");
    if (!jobId) return jsonError(Object.assign(new Error("id required"), { status: 400 }));
    const [row] = await db.select().from(schema.videoJobs).where(eq(schema.videoJobs.id, jobId)).limit(1);
    if (!row || row.userId !== auth.userId) {
      return jsonError(Object.assign(new Error("not found"), { status: 404 }));
    }
    return Response.json({ data: row });
  } catch (error) {
    return jsonError(error);
  }
}
