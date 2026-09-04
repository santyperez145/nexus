import { z } from "zod";
import { allRuntimeModels } from "@/lib/catalog/runtime";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { checkFreeRateLimit, releaseReserve } from "@/lib/gateway/billing";
import { resolveByokKey } from "@/lib/gateway/byok";
import {
  resolveEmbeddingRoute,
  validateEmbeddingResult,
} from "@/lib/gateway/embedding-routing";
import { chargeAndRecordMedia, holdMediaCredits } from "@/lib/gateway/media-billing";
import {
  canUseByokForMedia,
  endpointMediaPrivacyAllowed,
} from "@/lib/gateway/media-privacy";
import { embedTexts, hasProviderKey } from "@/lib/gateway/providers";
import { assertRateLimit } from "@/lib/gateway/rate-limit";

const providerList = z.array(z.string().trim().min(1).max(120)).max(64);
const priceCap = z.number().finite().min(0).max(1_000_000);
const providerPreferences = z.object({
  order: providerList.optional(),
  ignore: providerList.optional(),
  only: providerList.optional(),
  allow_fallbacks: z.boolean().optional(),
  data_collection: z.enum(["allow", "deny"]).optional(),
  zdr: z.boolean().optional(),
  sort: z.enum(["price", "throughput", "latency"]).optional(),
  quantizations: providerList.optional(),
  max_price: z.object({ prompt: priceCap.optional(), completion: priceCap.optional() }).optional(),
  preferred_min_throughput: z.number().finite().min(0).max(1_000_000).optional(),
  preferred_max_latency: z.number().finite().min(0).max(3_600).optional(),
});

const embeddingRequest = z.object({
  model: z.string().trim().min(1).max(368).optional(),
  input: z.union([
    z.string().min(1).max(32_000),
    z.array(z.string().min(1).max(32_000)).min(1).max(2_048),
  ]),
  encoding_format: z.enum(["float", "base64"]).default("float"),
  dimensions: z.number().int().min(1).max(65_536).optional(),
  user: z.string().trim().min(1).max(256).optional(),
  provider: providerPreferences.optional(),
});

function invalidRequest(message: string, details?: unknown) {
  return Object.assign(new Error(message), {
    status: 400,
    code: "invalid_request",
    ...(details ? { details } : {}),
  });
}

function base64Vector(vector: number[]) {
  const buffer = Buffer.allocUnsafe(vector.length * Float32Array.BYTES_PER_ELEMENT);
  vector.forEach((value, index) => buffer.writeFloatLE(value, index * Float32Array.BYTES_PER_ELEMENT));
  return buffer.toString("base64");
}

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    await assertRateLimit(auth);
    const parsed = embeddingRequest.safeParse(await req.json());
    if (!parsed.success) {
      throw invalidRequest("Invalid embeddings request", parsed.error.flatten());
    }
    const body = parsed.data;
    const input = Array.isArray(body.input) ? body.input : [body.input];
    const totalCharacters = input.reduce((total, value) => total + value.length, 0);
    if (totalCharacters > 1_000_000) {
      throw invalidRequest("input must contain at most 1000000 total characters");
    }

    const plan = resolveEmbeddingRoute({
      model: body.model,
      catalog: await allRuntimeModels(),
      auth,
      provider: body.provider,
    });
    if (!plan.endpoints.length) {
      throw Object.assign(new Error("No embedding provider matches the routing and privacy policy"), {
        status: 503,
        code: "provider_unavailable",
      });
    }

    const requestRequiresPrivateRoute =
      body.provider?.zdr === true || body.provider?.data_collection === "deny";
    const allowByok = canUseByokForMedia(auth) && !requestRequiresPrivateRoute;
    const byokByProvider = new Map<string, string | undefined>();
    const candidates: Array<{
      endpoint: (typeof plan.endpoints)[number];
      byok?: string;
      isByok: boolean;
    }> = [];
    for (const endpoint of plan.endpoints) {
      let byok: string | undefined;
      if (!endpoint.providerConnectionId && allowByok) {
        if (!byokByProvider.has(endpoint.adapter)) {
          byokByProvider.set(
            endpoint.adapter,
            await resolveByokKey(auth.userId, endpoint.adapter, auth),
          );
        }
        byok = byokByProvider.get(endpoint.adapter);
      }
      const isByok = Boolean(byok);
      if (!endpointMediaPrivacyAllowed(auth, endpoint, isByok)) continue;
      if (hasProviderKey(endpoint, byok)) candidates.push({ endpoint, byok, isByok });
    }
    if (!candidates.length) {
      throw Object.assign(new Error("No credentials for an eligible embedding provider"), {
        status: 503,
        code: "provider_unwired",
      });
    }

    const reservationTokens = Math.max(
      1,
      new TextEncoder().encode(input.join("\n")).byteLength,
    );
    let lastProviderError: unknown;
    for (const candidate of candidates) {
      const { endpoint, byok, isByok } = candidate;
      await checkFreeRateLimit(auth, endpoint.free === true);
      const pricing = endpoint.pricing;
      const reservation = await holdMediaCredits({
        auth,
        modality: "embedding",
        isByok,
        promptTokens: reservationTokens,
        pricing,
      });
      const started = Date.now();
      let result: Awaited<ReturnType<typeof embedTexts>>;
      let verified: ReturnType<typeof validateEmbeddingResult>;
      try {
        result = await embedTexts({
          texts: input,
          endpoint,
          byok,
          dimensions: body.dimensions,
          user: body.user,
          signal: req.signal,
        });
        verified = validateEmbeddingResult({
          embeddings: result.embeddings,
          expectedCount: input.length,
          requestedDimensions: body.dimensions,
          reportedTokens: result.tokens,
          reservationTokens,
        });
      } catch (error) {
        await releaseReserve(auth, reservation);
        lastProviderError = error;
        continue;
      }

      try {
        const promptTokens = verified.promptTokens;
        const billed = await chargeAndRecordMedia({
          auth,
          headers: req.headers,
          modality: "embedding",
          model: plan.model.id,
          provider: isByok ? `${endpoint.adapter}-byok` : endpoint.adapter,
          local: false,
          isByok,
          promptTokens,
          completionTokens: 0,
          pricing,
          latencyMs: Date.now() - started,
          reservation,
          metadata: {
            requested_model: plan.requested,
            dimensions: verified.dimensions,
            encoding_format: body.encoding_format,
          },
        });
        return Response.json({
          object: "list",
          data: result.embeddings.map((embedding, index) => ({
            object: "embedding",
            embedding:
              body.encoding_format === "base64" ? base64Vector(embedding) : embedding,
            index,
          })),
          model: plan.model.id,
          provider: endpoint.adapter,
          usage: {
            prompt_tokens: promptTokens,
            total_tokens: promptTokens,
            cost: billed.costMicros / 1_000_000,
          },
          id: billed.id,
          is_byok: isByok,
        });
      } catch (error) {
        await releaseReserve(auth, reservation);
        throw error;
      }
    }
    throw lastProviderError ?? Object.assign(new Error("All embedding providers failed"), {
      status: 503,
      code: "provider_unavailable",
    });
  } catch (error) {
    return jsonError(error);
  }
}
