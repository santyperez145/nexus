import { eq } from "drizzle-orm";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { resolveByokKey } from "@/lib/gateway/byok";
import { chargeAndRecordMedia, holdMediaCredits, MEDIA_DEFAULT_USD } from "@/lib/gateway/media-billing";
import { releaseReserve } from "@/lib/gateway/billing";
import { db, schema } from "@/lib/db";
import { id } from "@/lib/ids";
import { pollVideoJob, startVideoJob } from "@/lib/media/upstream";
import { canAccess } from "@/lib/gateway/tenant";

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const body = await req.json();
    const prompt = String(body.prompt ?? "");
    const model = body.model ?? "nexus/video";
    const falKey = await resolveByokKey(auth.userId, "fal", auth);
    const replicateToken = await resolveByokKey(auth.userId, "replicate", auth);
    const platform = Boolean(process.env.FAL_KEY?.trim() || process.env.REPLICATE_API_TOKEN?.trim());
    const isByok =
      Boolean(falKey || replicateToken) &&
      !process.env.FAL_KEY?.trim() &&
      !process.env.REPLICATE_API_TOKEN?.trim();
    if (!falKey && !replicateToken && !platform) {
      return jsonError(
        Object.assign(new Error("No provider credentials for video. Configure FAL_KEY, REPLICATE_API_TOKEN or BYOK."), {
          status: 503,
          code: "provider_unwired",
        }),
      );
    }
    const reservation = await holdMediaCredits({
      auth,
      modality: "video",
      isByok,
      usd: MEDIA_DEFAULT_USD.video,
    });
    const started = Date.now();
    try {
    const live = await startVideoJob({ prompt, model, falKey, replicateToken });
    const local = !live || "error" in live;
    if (local) {
      await releaseReserve(auth, reservation);
      return jsonError(
        Object.assign(new Error(live && "error" in live ? String(live.error) : "Video provider unavailable"), {
          status: 502,
        }),
      );
    }
    const provider = live.provider ?? "fal";
    let status = live && "data" in live && !("error" in live) ? "processing" : live ? "failed" : "completed";
    let resultUrl: string | null = null;

    if (live && "data" in live && live.data && typeof live.data === "object") {
      const data = live.data as {
        video?: { url?: string };
        url?: string;
        output?: string;
        urls?: { get?: string };
        id?: string;
        status?: string;
      };
      resultUrl =
        data.video?.url ??
        data.url ??
        (typeof data.output === "string" ? data.output : null) ??
        data.urls?.get ??
        (data.id ? `https://api.replicate.com/v1/predictions/${data.id}` : null);
      if (data.video?.url || data.url || typeof data.output === "string") status = "completed";
      else if (data.status === "succeeded") status = "completed";
    }

    const row = {
      id: id("vid"),
      userId: auth.userId,
      workspaceId: auth.workspaceId ?? null,
      model,
      prompt,
      status,
      resultUrl,
    };
    await db.insert(schema.videoJobs).values(row);
    const billed = await chargeAndRecordMedia({
      auth,
      headers: req.headers,
      modality: "video",
      model,
      provider,
      local: false,
      isByok,
      usd: MEDIA_DEFAULT_USD.video,
      latencyMs: Date.now() - started,
      metadata: { video_job_id: row.id },
      finishReason: status === "failed" ? "error" : "stop",
      reservation,
    });
    return Response.json({
      id: row.id,
      generation_id: billed.id,
      status: row.status,
      model: row.model,
      polling_url: `/api/v1/videos?id=${row.id}`,
      provider,
      cost: billed.costMicros / 1_000_000,
    });
    } catch (error) {
      await releaseReserve(auth, reservation);
      throw error;
    }
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
    if (!row || !canAccess(auth, row)) {
      return jsonError(Object.assign(new Error("not found"), { status: 404 }));
    }
    if (row.status === "processing" && row.resultUrl?.startsWith("http")) {
      const replicateToken = await resolveByokKey(auth.userId, "replicate", auth);
      const falKey = await resolveByokKey(auth.userId, "fal", auth);
      const polled = await pollVideoJob({
        pollUrl: row.resultUrl,
        falKey,
        replicateToken,
      });
      if (polled?.url) {
        await db
          .update(schema.videoJobs)
          .set({ status: "completed", resultUrl: polled.url })
          .where(eq(schema.videoJobs.id, jobId));
        return Response.json({ data: { ...row, status: "completed", resultUrl: polled.url } });
      }
      if (polled?.failed) {
        await db.update(schema.videoJobs).set({ status: "failed" }).where(eq(schema.videoJobs.id, jobId));
        return Response.json({ data: { ...row, status: "failed" } });
      }
    }
    return Response.json({ data: row });
  } catch (error) {
    return jsonError(error);
  }
}
