import { db, schema } from "@/lib/db";
import { generationId } from "@/lib/ids";
import { usdToMicros } from "@/lib/money";
import { dispatchGenerationWebhook } from "@/lib/observability/dispatch";
import {
  maybeAutoTopup,
  releaseReserve,
  reserveCredits,
  settleUsage,
  type CreditReservation,
} from "./billing";
import type { AuthContext } from "./types";

/** Conservative fallbacks; video never falls back because its unit economics vary by job. */
export const MEDIA_DEFAULT_USD = {
  image: 0.25,
  speech: 0.015,
  transcription: 0.006,
  video: 0,
} as const;

/** Video prices vary by provider/model/runtime, so production must pin a retail quote. */
export function configuredVideoRetailUsd() {
  const value = Number(process.env.NEXUS_VIDEO_RETAIL_USD);
  return Number.isFinite(value) && value >= 0.01 && value <= 10_000 ? value : null;
}

export async function holdMediaCredits(opts: {
  auth: AuthContext;
  modality: keyof typeof MEDIA_DEFAULT_USD | "embedding" | "rerank";
  isByok: boolean;
  usd?: number;
  promptTokens?: number;
  completionTokens?: number;
  pricing?: { prompt: number; completion: number };
}) {
  if (opts.auth.guest) {
    throw Object.assign(new Error("Guest cannot use paid media APIs"), { status: 401, code: "invalid_api_key" });
  }
  let estimated = 0;
  if ((opts.modality === "embedding" || opts.modality === "rerank") && opts.pricing) {
    estimated = usdToMicros(
      (opts.promptTokens ?? 0) * opts.pricing.prompt + (opts.completionTokens ?? 0) * opts.pricing.completion,
    );
  } else {
    if (opts.modality === "video" && opts.usd == null) {
      throw Object.assign(new Error("Video retail pricing is not configured"), {
        status: 503,
        code: "provider_unpriced",
      });
    }
    estimated = usdToMicros(opts.usd ?? MEDIA_DEFAULT_USD[opts.modality as keyof typeof MEDIA_DEFAULT_USD] ?? 0);
  }
  const genId = generationId();
  return reserveCredits(opts.auth, genId, estimated, {
    isFree: estimated <= 0,
    byokFeeOnly: opts.isByok && estimated > 0,
  });
}

export async function chargeAndRecordMedia(opts: {
  auth: AuthContext;
  headers?: Headers;
  modality: keyof typeof MEDIA_DEFAULT_USD | "embedding" | "rerank";
  model: string;
  provider: string;
  local: boolean;
  isByok: boolean;
  usd?: number;
  promptTokens?: number;
  completionTokens?: number;
  pricing?: { prompt: number; completion: number };
  latencyMs?: number;
  finishReason?: string;
  metadata?: Record<string, unknown>;
  reservation?: CreditReservation;
}) {
  const genId = opts.reservation?.generationId ?? generationId();
  const started = Date.now();
  let costMicros = 0;
  const reservation = opts.reservation;

  if (opts.local) {
    if (reservation?.reservedMicros) await releaseReserve(opts.auth, reservation);
  } else if ((opts.modality === "embedding" || opts.modality === "rerank") && opts.pricing) {
    const promptTokens = opts.promptTokens ?? 0;
    const settled = await settleUsage({
      auth: opts.auth,
      generationId: genId,
      promptTokens,
      completionTokens: opts.completionTokens ?? 0,
      pricing: opts.pricing,
      isFree: opts.pricing.prompt === 0 && opts.pricing.completion === 0,
      isByok: opts.isByok,
      reservation,
    });
    costMicros = settled.micros;
  } else {
    if (opts.modality === "video" && opts.usd == null) {
      throw Object.assign(new Error("Video retail pricing is not configured"), {
        status: 503,
        code: "provider_unpriced",
      });
    }
    const usd = opts.usd ?? MEDIA_DEFAULT_USD[opts.modality as keyof typeof MEDIA_DEFAULT_USD] ?? 0;
    if (usd > 0) {
      const settled = await settleUsage({
        auth: opts.auth,
        generationId: genId,
        promptTokens: 0,
        completionTokens: 1,
        pricing: { prompt: 0, completion: usd },
        isFree: false,
        isByok: opts.isByok,
        reservation,
      });
      costMicros = settled.micros;
    } else if (reservation?.reservedMicros) {
      await releaseReserve(opts.auth, reservation);
    }
  }

  if (!opts.auth.guest) {
    await db.insert(schema.generations).values({
      id: genId,
      userId: opts.auth.userId,
      apiKeyId: opts.auth.apiKeyId,
      workspaceId: opts.auth.workspaceId,
      requestedModel: opts.model,
      routedModel: opts.model,
      provider: opts.provider,
      finishReason: opts.finishReason ?? "stop",
      promptTokens: opts.promptTokens ?? 0,
      completionTokens: opts.completionTokens ?? 0,
      reasoningTokens: 0,
      costMicros,
      latencyMs: opts.latencyMs ?? Date.now() - started,
      streamed: false,
      isByok: opts.isByok,
      appReferer: opts.headers?.get("http-referer") ?? opts.headers?.get("referer") ?? null,
      appTitle: opts.headers?.get("x-nexus-title") ?? opts.headers?.get("x-title") ?? null,
      metadata: { modality: opts.modality, local: opts.local, ...(opts.metadata ?? {}) },
    });

    await dispatchGenerationWebhook(opts.auth.userId, {
      id: genId,
      model: opts.model,
      provider: opts.provider,
      cost_micros: costMicros,
      latency_ms: opts.latencyMs ?? 0,
    }, opts.auth.workspaceId).catch((error) => {
      console.error("Failed to enqueue media observability delivery", {
        generationId: genId,
        message: error instanceof Error ? error.message : "unknown",
      });
    });
    await maybeAutoTopup(opts.auth.billingUserId ?? opts.auth.userId).catch((error) => {
      console.error("Media auto top-up failed", {
        generationId: genId,
        message: error instanceof Error ? error.message : "unknown",
      });
    });
  }

  return { id: genId, costMicros };
}
