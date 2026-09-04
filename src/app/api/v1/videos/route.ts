import { eq } from "drizzle-orm";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { resolveByokKey } from "@/lib/gateway/byok";
import {
  chargeAndRecordMedia,
  configuredVideoRetailUsd,
  holdMediaCredits,
} from "@/lib/gateway/media-billing";
import { releaseReserve } from "@/lib/gateway/billing";
import { db, schema } from "@/lib/db";
import { id } from "@/lib/ids";
import { pollVideoJob, startVideoJob } from "@/lib/media/upstream";
import { canAccess } from "@/lib/gateway/tenant";
import { assertRateLimit } from "@/lib/gateway/rate-limit";
import { selectVideoCredential } from "@/lib/media/credentials";
import { MEDIA_PRICE_VERSION } from "@/lib/media/pricing";
import { assertMediaPrivacy, canUseByokForMedia } from "@/lib/gateway/media-privacy";
import { assertVideoRetentionCompatible, shouldRetainPayloads } from "@/lib/privacy/retention";

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    await assertRateLimit(auth);
    assertVideoRetentionCompatible(auth);
    const body = await req.json();
    const prompt = String(body.prompt ?? "").trim();
    if (!prompt || prompt.length > 32_000) {
      return jsonError(Object.assign(new Error("prompt must contain 1 to 32000 characters"), { status: 400 }));
    }
    const model = String(body.model ?? "nexus/video");
    const videoUsd = configuredVideoRetailUsd();
    if (videoUsd == null) {
      return jsonError(
        Object.assign(new Error("Video retail pricing is not configured"), {
          status: 503,
          code: "provider_unpriced",
        }),
      );
    }
    const falKey = await resolveByokKey(auth.userId, "fal", auth);
    const replicateToken = await resolveByokKey(auth.userId, "replicate", auth);
    const allowByok = canUseByokForMedia(auth);
    const selected = selectVideoCredential({
      falByok: allowByok ? falKey : undefined,
      replicateByok: allowByok ? replicateToken : undefined,
      falPlatform: process.env.FAL_KEY,
      replicatePlatform: process.env.REPLICATE_API_TOKEN,
    });
    if (selected) assertMediaPrivacy(auth, selected.provider, selected.isByok);
    if (!selected) {
      if (!allowByok) assertMediaPrivacy(auth, "fal", false);
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
      isByok: selected.isByok,
      usd: videoUsd,
    });
    const started = Date.now();
    try {
    const live = await startVideoJob({
      prompt,
      model,
      provider: selected.provider,
      apiKey: selected.apiKey,
    });
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
      prompt: shouldRetainPayloads(auth) ? prompt : null,
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
      isByok: selected.isByok,
      usd: videoUsd,
      latencyMs: Date.now() - started,
      metadata: { video_job_id: row.id, retail_usd: videoUsd, price_version: MEDIA_PRICE_VERSION },
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
      price_version: MEDIA_PRICE_VERSION,
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
    await assertRateLimit(auth);
    const jobId = new URL(req.url).searchParams.get("id");
    if (!jobId) return jsonError(Object.assign(new Error("id required"), { status: 400 }));
    const [row] = await db.select().from(schema.videoJobs).where(eq(schema.videoJobs.id, jobId)).limit(1);
    if (!row || !canAccess(auth, row)) {
      return jsonError(Object.assign(new Error("not found"), { status: 404 }));
    }
    if (row.status === "processing" && row.resultUrl?.startsWith("http")) {
      const allowByok = canUseByokForMedia(auth);
      const replicateToken = allowByok
        ? await resolveByokKey(auth.userId, "replicate", auth)
        : undefined;
      const falKey = allowByok ? await resolveByokKey(auth.userId, "fal", auth) : undefined;
      const pollProvider = new URL(row.resultUrl).hostname.endsWith("replicate.com")
        ? "replicate"
        : "fal";
      assertMediaPrivacy(
        auth,
        pollProvider,
        pollProvider === "replicate" ? Boolean(replicateToken) : Boolean(falKey),
      );
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
