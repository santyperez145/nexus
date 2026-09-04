import { z } from "zod";
import { allRuntimeModels } from "@/lib/catalog/runtime";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { checkFreeRateLimit, releaseReserve } from "@/lib/gateway/billing";
import { resolveByokKey } from "@/lib/gateway/byok";
import { chargeAndRecordMedia, holdMediaCredits } from "@/lib/gateway/media-billing";
import {
  canUseByokForMedia,
  endpointMediaPrivacyAllowed,
} from "@/lib/gateway/media-privacy";
import { hasProviderKey, rerankDocuments } from "@/lib/gateway/providers";
import { assertRateLimit } from "@/lib/gateway/rate-limit";
import {
  resolveRerankRoute,
  validateRerankResult,
} from "@/lib/gateway/rerank-routing";

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
const textDocument = z.union([
  z.string().min(1).max(128_000),
  z.object({ text: z.string().min(1).max(128_000) }),
]);
const rerankRequest = z.object({
  model: z.string().trim().min(1).max(368),
  query: z.string().min(1).max(32_000),
  documents: z.array(textDocument).min(1).max(1_000),
  top_n: z.number().int().min(1).max(1_000).optional(),
  return_documents: z.boolean().default(true),
  truncation: z.boolean().default(true),
  provider: providerPreferences.optional(),
});

function invalidRequest(message: string, details?: unknown) {
  return Object.assign(new Error(message), {
    status: 400,
    code: "invalid_request",
    ...(details ? { details } : {}),
  });
}

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    await assertRateLimit(auth);
    const parsed = rerankRequest.safeParse(await req.json());
    if (!parsed.success) {
      throw invalidRequest("Invalid rerank request", parsed.error.flatten());
    }
    const body = parsed.data;
    const documents = body.documents.map((document) =>
      typeof document === "string" ? document : document.text,
    );
    const topN = Math.min(body.top_n ?? documents.length, documents.length);
    const encoder = new TextEncoder();
    const queryBytes = encoder.encode(body.query).byteLength;
    const reservationTokens =
      queryBytes * documents.length +
      documents.reduce((total, document) => total + encoder.encode(document).byteLength, 0);
    if (reservationTokens > 4_000_000) {
      throw invalidRequest("query and documents exceed the 4000000-byte rerank budget");
    }

    const plan = resolveRerankRoute({
      model: body.model,
      catalog: await allRuntimeModels(),
      auth,
      provider: body.provider,
    });
    if (!plan.endpoints.length) {
      throw Object.assign(new Error("No rerank provider matches the routing and privacy policy"), {
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
      throw Object.assign(new Error("No credentials for an eligible rerank provider"), {
        status: 503,
        code: "provider_unwired",
      });
    }

    let lastProviderError: unknown;
    for (const candidate of candidates) {
      const { endpoint, byok, isByok } = candidate;
      await checkFreeRateLimit(auth, endpoint.free === true);
      const pricing = endpoint.pricing;
      const reservation = await holdMediaCredits({
        auth,
        modality: "rerank",
        isByok,
        promptTokens: reservationTokens,
        pricing,
      });
      const started = Date.now();
      let result: Awaited<ReturnType<typeof rerankDocuments>>;
      let verified: ReturnType<typeof validateRerankResult>;
      try {
        result = await rerankDocuments({
          endpoint,
          query: body.query,
          documents,
          topN,
          truncation: body.truncation,
          byok,
          signal: req.signal,
        });
        verified = validateRerankResult({
          results: result.results,
          documentCount: documents.length,
          maxResults: topN,
          reportedTokens: result.tokens,
          reservationTokens,
        });
      } catch (error) {
        await releaseReserve(auth, reservation);
        lastProviderError = error;
        continue;
      }

      try {
        const billed = await chargeAndRecordMedia({
          auth,
          headers: req.headers,
          modality: "rerank",
          model: plan.model.id,
          provider: isByok ? `${endpoint.adapter}-byok` : endpoint.adapter,
          local: false,
          isByok,
          promptTokens: verified.promptTokens,
          completionTokens: 0,
          pricing,
          latencyMs: Date.now() - started,
          reservation,
          metadata: {
            requested_model: plan.requested,
            documents: documents.length,
            top_n: topN,
            upstream_id: result.upstreamId,
          },
        });
        return Response.json({
          id: billed.id,
          model: plan.model.id,
          provider: endpoint.adapter,
          results: verified.results.map((row) => ({
            ...row,
            ...(body.return_documents ? { document: { text: documents[row.index] } } : {}),
          })),
          usage: {
            search_units: 1,
            total_tokens: verified.promptTokens,
            cost: billed.costMicros / 1_000_000,
          },
          is_byok: isByok,
        });
      } catch (error) {
        await releaseReserve(auth, reservation);
        throw error;
      }
    }
    throw lastProviderError ?? Object.assign(new Error("All rerank providers failed"), {
      status: 503,
      code: "provider_unavailable",
    });
  } catch (error) {
    return jsonError(error);
  }
}
