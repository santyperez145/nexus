import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { decryptSecret, encryptSecret, sha256 } from "@/lib/crypto";
import { db, ensureDb, schema, withTransaction } from "@/lib/db";
import { id } from "@/lib/ids";
import { assertPublicHttpUrl, fetchPublicUrl, readResponseJsonLimited } from "@/lib/net/public-url";
import type { CatalogModel, ModelEndpoint } from "@/lib/catalog/types";
import { providerById } from "@/lib/providers/registry";

/** OpenRouter-like economics: provider list price is passed through without markup. */
export const NEXUS_PROVIDER_MARKUP_BPS = 0;
export const MANAGED_PROVIDER_HEALTH_FRESH_MS = 30 * 60 * 1000;

const PROVIDER_SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\/[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/;
const MODALITIES = new Set([
  "text",
  "image",
  "file",
  "audio",
  "video",
  "embeddings",
  "rerank",
  "speech",
  "transcription",
]);

export type ManagedProviderProtocol = "openai" | "anthropic" | "google" | "mistral";
export type ManagedProviderAuthScheme = "bearer" | "anthropic" | "google-query";
type ProviderConnection = typeof schema.providerConnections.$inferSelect;
type ProviderOffering = typeof schema.providerOfferings.$inferSelect;

const optionalUrl = z.string().trim().url().max(2048).optional().nullable();

export const createProviderConnectionSchema = z
  .object({
    slug: z.string().trim().toLowerCase().regex(PROVIDER_SLUG),
    label: z.string().trim().min(2).max(120),
    protocol: z.enum(["openai", "anthropic", "google", "mistral"]),
    auth_scheme: z.enum(["bearer", "anthropic", "google-query"]).default("bearer"),
    base_url: z.string().trim().url().max(2048),
    models_path: z.string().trim().min(1).max(512).default("/models"),
    api_key: z.string().trim().min(8).max(4096),
    zdr_capable: z.boolean().default(false),
    privacy_policy_url: optionalUrl,
    terms_url: optionalUrl,
    status_page_url: optionalUrl,
  })
  .superRefine((value, context) => {
    const expected =
      value.protocol === "anthropic"
        ? "anthropic"
        : value.protocol === "google"
          ? "google-query"
          : "bearer";
    if (value.auth_scheme !== expected) {
      context.addIssue({
        code: "custom",
        path: ["auth_scheme"],
        message: `${value.protocol} protocol requires ${expected} authentication`,
      });
    }
  });

export const updateProviderConnectionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("probe") }),
  z.object({
    action: z.literal("activate"),
    zdr_verified: z.boolean().default(false),
    no_training_verified: z.boolean().default(false),
  }),
  z.object({ action: z.literal("suspend") }),
  z.object({
    action: z.literal("rotate_secret"),
    api_key: z.string().trim().min(8).max(4096),
  }),
  z.object({
    action: z.literal("update"),
    label: z.string().trim().min(2).max(120),
    base_url: z.string().trim().url().max(2048),
    models_path: z.string().trim().min(1).max(512),
    zdr_capable: z.boolean(),
    privacy_policy_url: optionalUrl,
    terms_url: optionalUrl,
    status_page_url: optionalUrl,
  }),
]);

export const reviewProviderOfferingSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("activate"),
    canonical_model_id: z.string().trim().min(3).max(368),
    free: z.boolean().default(false),
    cost_prompt: z.coerce.number().finite().min(0).max(1000),
    cost_completion: z.coerce.number().finite().min(0).max(1000),
  }),
  z.object({ action: z.literal("suspend") }),
]);

function invalid(message: string, code = "invalid_request", status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function notFound(resource: string) {
  return invalid(`${resource} not found`, "not_found", 404);
}

export function normalizeProviderBaseUrl(raw: string) {
  const url = assertPublicHttpUrl(raw.trim());
  if (url.protocol !== "https:") throw invalid("Provider base URL must use HTTPS");
  if (url.search || url.hash) throw invalid("Provider base URL cannot include query or fragment");
  return url.toString().replace(/\/$/, "");
}

export function normalizeProviderModelsPath(raw: string) {
  const value = raw.trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    throw invalid("Models path must be an absolute path on the provider host");
  }
  const parsed = new URL(value, "https://nexus.invalid");
  if (parsed.origin !== "https://nexus.invalid" || parsed.hash || parsed.pathname.includes("..")) {
    throw invalid("Invalid provider models path");
  }
  return `${parsed.pathname}${parsed.search}`;
}

function normalizeDocumentUrl(raw: string | null | undefined) {
  if (!raw) return null;
  const url = assertPublicHttpUrl(raw.trim());
  if (url.protocol !== "https:") throw invalid("Provider policy URLs must use HTTPS");
  return url.toString();
}

function providerModelsUrl(connection: Pick<ProviderConnection, "baseUrl" | "modelsPath" | "authScheme">, key: string) {
  const url = new URL(`${connection.baseUrl}${connection.modelsPath}`);
  if (connection.authScheme === "google-query") url.searchParams.set("key", key);
  return url.toString();
}

function providerAuthHeaders(
  connection: Pick<ProviderConnection, "authScheme">,
  key: string,
): Record<string, string> {
  if (connection.authScheme === "anthropic") {
    return { "x-api-key": key, "anthropic-version": "2023-06-01" };
  }
  if (connection.authScheme === "google-query") return {};
  return { Authorization: `Bearer ${key}` };
}

function decimal(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1000) return null;
  return parsed.toFixed(15);
}

function integer(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function stringArray(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) return fallback;
  return [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))]
    .sort()
    .slice(0, 128);
}

function modalities(value: unknown, fallback: string[]) {
  const values = stringArray(value)
    .map((item) => item.toLowerCase())
    .filter((item) => MODALITIES.has(item));
  return values.length ? values : fallback;
}

function canonicalModelId(raw: string, providerSlug: string) {
  const candidate = raw.includes("/") ? raw : `${providerSlug}/${raw}`;
  if (!MODEL_ID.test(candidate)) throw invalid(`Invalid provider model id: ${raw}`);
  return candidate;
}

type DiscoveredOffering = {
  providerModelId: string;
  canonicalModelId: string;
  displayName: string;
  description: string;
  createdUnix: number;
  contextLength: number;
  maxCompletionTokens: number;
  inputModalities: string[];
  outputModalities: string[];
  supportedParameters: string[];
  quantization: string;
  providerReady: boolean;
  free: boolean;
  reportedPromptPrice: string | null;
  reportedCompletionPrice: string | null;
  capacityTpm: number | null;
  deprecationAt: Date | null;
  sourceHash: string;
};

export function normalizeDiscoveredOffering(raw: unknown, providerSlug: string): DiscoveredOffering {
  if (!raw || typeof raw !== "object") throw invalid("Provider model entries must be objects");
  const item = raw as Record<string, unknown>;
  const providerModelId = typeof item.id === "string" ? item.id.trim() : "";
  if (!providerModelId || providerModelId.length > 368) throw invalid("Provider model id is required");
  const architecture = item.architecture && typeof item.architecture === "object"
    ? item.architecture as Record<string, unknown>
    : {};
  const topProvider = item.top_provider && typeof item.top_provider === "object"
    ? item.top_provider as Record<string, unknown>
    : {};
  const openrouter = item.openrouter && typeof item.openrouter === "object"
    ? item.openrouter as Record<string, unknown>
    : {};
  const rawPricing = Array.isArray(item.pricing) ? item.pricing[0] : item.pricing;
  const pricing = rawPricing && typeof rawPricing === "object"
    ? rawPricing as Record<string, unknown>
    : {};
  const free = item.is_free === true;
  const reportedPromptPrice = free ? decimal(0) : decimal(pricing.prompt);
  const reportedCompletionPrice = free ? decimal(0) : decimal(pricing.completion);
  const providerReady = item.is_ready !== false;
  const inputModalities = modalities(
    architecture.input_modalities ?? item.input_modalities,
    ["text"],
  );
  const outputModalities = modalities(
    architecture.output_modalities ?? item.output_modalities,
    ["text"],
  );
  const supportedFeatures = stringArray(item.supported_features).flatMap((feature) => {
    if (feature === "tools") return ["tools", "tool_choice"];
    if (feature === "json_mode" || feature === "structured_outputs") return ["response_format"];
    if (feature === "reasoning") return ["reasoning"];
    return [feature];
  });
  const supportedParameters = [...new Set([
    ...stringArray(item.supported_parameters),
    ...supportedFeatures,
  ])].sort();
  const canonicalRaw =
    (typeof openrouter.slug === "string" && openrouter.slug) ||
    (typeof item.canonical_slug === "string" && item.canonical_slug) ||
    (typeof item.hugging_face_id === "string" && item.hugging_face_id) ||
    providerModelId;
  const modelId = canonicalModelId(canonicalRaw, providerSlug);
  const deprecationDate = typeof item.deprecation_date === "string" ? new Date(item.deprecation_date) : null;
  const deprecationAt = deprecationDate && Number.isFinite(deprecationDate.getTime()) ? deprecationDate : null;
  const contract = {
    providerModelId,
    canonicalModelId: modelId,
    contextLength: integer(item.context_length ?? topProvider.context_length),
    maxCompletionTokens: integer(topProvider.max_completion_tokens),
    inputModalities,
    outputModalities,
    supportedParameters,
    quantization: typeof item.quantization === "string" ? item.quantization.slice(0, 40) : "unknown",
    providerReady,
    free,
    reportedPromptPrice,
    reportedCompletionPrice,
    deprecationAt: deprecationAt?.toISOString() ?? null,
  };
  return {
    ...contract,
    displayName: typeof item.name === "string" ? item.name.slice(0, 180) : modelId,
    description: typeof item.description === "string" ? item.description.slice(0, 1000) : "",
    createdUnix: integer(item.created),
    capacityTpm: item.capacity_tpm == null ? null : integer(item.capacity_tpm),
    deprecationAt,
    sourceHash: sha256(JSON.stringify(contract)),
  };
}

function extractProviderModels(payload: unknown) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const object = payload as { data?: unknown; models?: unknown };
  if (Array.isArray(object.data)) return object.data;
  if (Array.isArray(object.models)) return object.models;
  return [];
}

export function providerProbeIsFresh(connection: Pick<ProviderConnection, "lastProbeOk" | "lastProbedAt">, now = Date.now()) {
  if (!connection.lastProbeOk || !connection.lastProbedAt) return false;
  const checked = new Date(connection.lastProbedAt).getTime();
  const age = now - checked;
  return Number.isFinite(checked) && age >= -60_000 && age <= MANAGED_PROVIDER_HEALTH_FRESH_MS;
}

export function priceWithMarkup(price: number, commissionBps = NEXUS_PROVIDER_MARKUP_BPS) {
  if (!Number.isFinite(price) || price < 0) throw invalid("Invalid provider unit price");
  if (!Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 10_000) {
    throw invalid("Invalid provider commission");
  }
  if (price === 0) return 0;
  return Math.ceil(price * (1 + commissionBps / 10_000) * 1e15) / 1e15;
}

export function offeringCanActivate(input: {
  providerReady: boolean;
  connectionActive: boolean;
  connectionHealthy: boolean;
  free: boolean;
  prompt: number;
  completion: number;
}) {
  if (!input.providerReady || !input.connectionActive || !input.connectionHealthy) return false;
  if (![input.prompt, input.completion].every((value) => Number.isFinite(value) && value >= 0)) return false;
  return input.free
    ? input.prompt === 0 && input.completion === 0
    : input.prompt > 0 || input.completion > 0;
}

export async function createProviderConnection(
  actorUserId: string,
  input: z.infer<typeof createProviderConnectionSchema>,
) {
  await ensureDb();
  if (providerById(input.slug)) {
    throw invalid("Provider slug conflicts with a built-in integration", "conflict", 409);
  }
  const now = new Date();
  const row = {
    id: id("pconn"),
    slug: input.slug,
    label: input.label,
    protocol: input.protocol,
    authScheme: input.auth_scheme,
    baseUrl: normalizeProviderBaseUrl(input.base_url),
    modelsPath: normalizeProviderModelsPath(input.models_path),
    encryptedKey: encryptSecret(input.api_key),
    secretHint: `••••${input.api_key.slice(-4)}`,
    zdrCapable: input.zdr_capable,
    privacyPolicyUrl: normalizeDocumentUrl(input.privacy_policy_url),
    termsUrl: normalizeDocumentUrl(input.terms_url),
    statusPageUrl: normalizeDocumentUrl(input.status_page_url),
    createdBy: actorUserId,
    createdAt: now,
    updatedAt: now,
  };
  try {
    const [created] = await db.insert(schema.providerConnections).values(row).returning();
    return created;
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) {
      throw invalid("Provider slug already exists", "conflict", 409);
    }
    throw error;
  }
}

async function providerConnection(connectionId: string) {
  const [connection] = await db
    .select()
    .from(schema.providerConnections)
    .where(eq(schema.providerConnections.id, connectionId))
    .limit(1);
  if (!connection) throw notFound("Provider connection");
  return connection;
}

async function persistManagedHealth(
  connection: ProviderConnection,
  result: { ok: boolean; status?: number; latencyMs: number; detail: string },
) {
  const checkedAt = new Date();
  await db
    .insert(schema.providerHealth)
    .values({
      id: id("ph"),
      provider: connection.slug,
      status: result.ok ? "up" : "down",
      latencyMs: result.latencyMs,
      lastCheck: checkedAt,
      detail: result.detail,
    })
    .onConflictDoUpdate({
      target: schema.providerHealth.provider,
      set: {
        status: result.ok ? "up" : "down",
        latencyMs: result.latencyMs,
        lastCheck: checkedAt,
        detail: result.detail,
      },
    });
}

async function recordProbeFailure(
  connection: ProviderConnection,
  started: number,
  error: unknown,
  status?: number,
  secret?: string,
) {
  const rawMessage = error instanceof Error ? error.message : String(error);
  let message = rawMessage
    .replace(/([?&](?:key|api_key|token|access_token)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(bearer\s+)[^\s]+/gi, "$1[redacted]");
  if (secret?.trim()) message = message.replaceAll(secret.trim(), "[redacted]");
  const latencyMs = Date.now() - started;
  await db
    .update(schema.providerConnections)
    .set({
      lastProbeOk: false,
      lastProbeStatus: status ?? null,
      lastProbeLatencyMs: latencyMs,
      lastProbeError: message.slice(0, 1000),
      lastProbedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.providerConnections.id, connection.id));
  await persistManagedHealth(connection, {
    ok: false,
    status,
    latencyMs,
    detail: message.slice(0, 280),
  });
}

export async function probeProviderConnection(connectionId: string) {
  await ensureDb();
  const connection = await providerConnection(connectionId);
  const key = decryptSecret(connection.encryptedKey);
  const started = Date.now();
  let response: Response;
  try {
    response = await fetchPublicUrl(providerModelsUrl(connection, key), {
      headers: providerAuthHeaders(connection, key),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    await recordProbeFailure(connection, started, error, undefined, key);
    throw invalid("Provider probe failed", "provider_probe_failed", 502);
  }
  if (!response.ok) {
    await response.body?.cancel("probe rejected");
    const error = invalid(`Provider returned HTTP ${response.status}`, "provider_probe_failed", 502);
    await recordProbeFailure(connection, started, error, response.status, key);
    throw error;
  }

  let rawModels: unknown[];
  try {
    const payload = await readResponseJsonLimited<unknown>(response, 2_000_000);
    rawModels = extractProviderModels(payload);
    if (!rawModels.length) throw invalid("Provider returned no models");
    if (rawModels.length > 2_000) throw invalid("Provider returned too many models");
  } catch (error) {
    await recordProbeFailure(connection, started, error, response.status, key);
    throw invalid("Provider returned an invalid model catalog", "provider_probe_failed", 502);
  }

  let discovered: DiscoveredOffering[];
  try {
    discovered = rawModels.map((model) => normalizeDiscoveredOffering(model, connection.slug));
  } catch (error) {
    await recordProbeFailure(connection, started, error, response.status, key);
    throw error;
  }
  const unique = new Map(discovered.map((model) => [model.providerModelId, model]));
  if (unique.size !== discovered.length) {
    const error = invalid("Provider catalog contains duplicate model ids", "provider_probe_failed", 502);
    await recordProbeFailure(connection, started, error, response.status, key);
    throw error;
  }

  const existing = await db
    .select()
    .from(schema.providerOfferings)
    .where(eq(schema.providerOfferings.connectionId, connection.id));
  const existingByModel = new Map(existing.map((row) => [row.providerModelId, row]));
  const seen = new Set<string>();
  const now = new Date();

  await withTransaction(async (tx) => {
    for (const model of discovered) {
      seen.add(model.providerModelId);
      const previous = existingByModel.get(model.providerModelId);
      const contractUnchanged = previous?.sourceHash === model.sourceHash;
      const preserveApproval = Boolean(
        previous && contractUnchanged && previous.pricingVerified && model.providerReady,
      );
      const nextStatus = !model.providerReady
        ? "suspended"
        : preserveApproval
          ? previous!.status
          : "staged";
      await tx
        .insert(schema.providerOfferings)
        .values({
          id: previous?.id ?? id("poff"),
          connectionId: connection.id,
          ...model,
          status: nextStatus,
          pricingVerified: preserveApproval,
          pricingVerifiedBy: preserveApproval ? previous!.pricingVerifiedBy : null,
          pricingVerifiedAt: preserveApproval ? previous!.pricingVerifiedAt : null,
          costPromptPrice: preserveApproval ? previous!.costPromptPrice : null,
          costCompletionPrice: preserveApproval ? previous!.costCompletionPrice : null,
          commissionBps: NEXUS_PROVIDER_MARKUP_BPS,
          lastSeenAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [schema.providerOfferings.connectionId, schema.providerOfferings.providerModelId],
          set: {
            canonicalModelId: model.canonicalModelId,
            displayName: model.displayName,
            description: model.description,
            createdUnix: model.createdUnix,
            contextLength: model.contextLength,
            maxCompletionTokens: model.maxCompletionTokens,
            inputModalities: model.inputModalities,
            outputModalities: model.outputModalities,
            supportedParameters: model.supportedParameters,
            quantization: model.quantization,
            providerReady: model.providerReady,
            free: model.free,
            reportedPromptPrice: model.reportedPromptPrice,
            reportedCompletionPrice: model.reportedCompletionPrice,
            capacityTpm: model.capacityTpm,
            deprecationAt: model.deprecationAt,
            sourceHash: model.sourceHash,
            status: nextStatus,
            pricingVerified: preserveApproval,
            pricingVerifiedBy: preserveApproval ? previous!.pricingVerifiedBy : null,
            pricingVerifiedAt: preserveApproval ? previous!.pricingVerifiedAt : null,
            costPromptPrice: preserveApproval ? previous!.costPromptPrice : null,
            costCompletionPrice: preserveApproval ? previous!.costCompletionPrice : null,
            commissionBps: NEXUS_PROVIDER_MARKUP_BPS,
            lastSeenAt: now,
            updatedAt: now,
          },
        });
    }
    for (const missing of existing.filter((row) => !seen.has(row.providerModelId))) {
      await tx
        .update(schema.providerOfferings)
        .set({
          providerReady: false,
          status: "suspended",
          pricingVerified: false,
          pricingVerifiedBy: null,
          pricingVerifiedAt: null,
          lastSeenAt: now,
          updatedAt: now,
        })
        .where(eq(schema.providerOfferings.id, missing.id));
    }
    await tx
      .update(schema.providerConnections)
      .set({
        lastProbeOk: true,
        lastProbeStatus: response.status,
        lastProbeLatencyMs: Date.now() - started,
        lastProbeError: null,
        lastProbedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.providerConnections.id, connection.id));
  });
  await persistManagedHealth(connection, {
    ok: true,
    status: response.status,
    latencyMs: Date.now() - started,
    detail: `Verified ${discovered.length} model${discovered.length === 1 ? "" : "s"}`,
  });
  return { count: discovered.length, status: response.status, latencyMs: Date.now() - started };
}

export async function updateProviderConnection(
  connectionId: string,
  actorUserId: string,
  input: z.infer<typeof updateProviderConnectionSchema>,
) {
  await ensureDb();
  const connection = await providerConnection(connectionId);
  if (input.action === "probe") return probeProviderConnection(connectionId);
  if (input.action === "suspend") {
    const [updated] = await db
      .update(schema.providerConnections)
      .set({ status: "suspended", updatedAt: new Date() })
      .where(eq(schema.providerConnections.id, connection.id))
      .returning();
    return updated;
  }
  if (input.action === "rotate_secret") {
    const [updated] = await db
      .update(schema.providerConnections)
      .set({
        encryptedKey: encryptSecret(input.api_key),
        secretHint: `••••${input.api_key.slice(-4)}`,
        status: connection.status === "active" ? "suspended" : "draft",
        lastProbeOk: false,
        lastProbeStatus: null,
        lastProbeError: "Credential rotated; a new probe is required",
        lastProbedAt: null,
        verifiedBy: null,
        verifiedAt: null,
        activatedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.providerConnections.id, connection.id))
      .returning();
    return updated;
  }
  if (input.action === "update") {
    const baseUrl = normalizeProviderBaseUrl(input.base_url);
    const modelsPath = normalizeProviderModelsPath(input.models_path);
    const endpointChanged = baseUrl !== connection.baseUrl || modelsPath !== connection.modelsPath;
    const [updated] = await db
      .update(schema.providerConnections)
      .set({
        label: input.label,
        baseUrl,
        modelsPath,
        zdrCapable: input.zdr_capable,
        zdrVerified: false,
        noTrainingVerified: false,
        privacyPolicyUrl: normalizeDocumentUrl(input.privacy_policy_url),
        termsUrl: normalizeDocumentUrl(input.terms_url),
        statusPageUrl: normalizeDocumentUrl(input.status_page_url),
        ...(endpointChanged
          ? {
              status: connection.status === "active" ? "suspended" : "draft",
              lastProbeOk: false,
              lastProbeStatus: null,
              lastProbeError: "Endpoint changed; a new probe is required",
              lastProbedAt: null,
              verifiedBy: null,
              verifiedAt: null,
              activatedAt: null,
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.providerConnections.id, connection.id))
      .returning();
    return updated;
  }

  if (!providerProbeIsFresh(connection)) {
    throw invalid("A successful provider probe from the last 30 minutes is required", "provider_unhealthy", 409);
  }
  if (input.zdr_verified && (!connection.zdrCapable || !connection.privacyPolicyUrl)) {
    throw invalid("ZDR cannot be verified without declared capability and a privacy policy", "privacy_unverified", 409);
  }
  if (input.no_training_verified && !connection.privacyPolicyUrl) {
    throw invalid("No-training cannot be verified without a privacy policy", "privacy_unverified", 409);
  }
  const now = new Date();
  const [updated] = await db
    .update(schema.providerConnections)
    .set({
      status: "active",
      zdrVerified: input.zdr_verified,
      noTrainingVerified: input.no_training_verified,
      verifiedBy: actorUserId,
      verifiedAt: now,
      activatedAt: now,
      updatedAt: now,
    })
    .where(eq(schema.providerConnections.id, connection.id))
    .returning();
  return updated;
}

export async function reviewProviderOffering(
  offeringId: string,
  actorUserId: string,
  input: z.infer<typeof reviewProviderOfferingSchema>,
) {
  await ensureDb();
  const [offering] = await db
    .select()
    .from(schema.providerOfferings)
    .where(eq(schema.providerOfferings.id, offeringId))
    .limit(1);
  if (!offering) throw notFound("Provider offering");
  if (input.action === "suspend") {
    const [updated] = await db
      .update(schema.providerOfferings)
      .set({ status: "suspended", pricingVerified: false, pricingVerifiedBy: null, pricingVerifiedAt: null, updatedAt: new Date() })
      .where(eq(schema.providerOfferings.id, offering.id))
      .returning();
    return updated;
  }
  const connection = await providerConnection(offering.connectionId);
  const canonical = canonicalModelId(input.canonical_model_id, connection.slug);
  if (!offeringCanActivate({
    providerReady: offering.providerReady,
    connectionActive: connection.status === "active",
    connectionHealthy: providerProbeIsFresh(connection),
    free: input.free,
    prompt: input.cost_prompt,
    completion: input.cost_completion,
  })) {
    throw invalid("Offering cannot be activated until provider health, readiness and pricing are verified", "offering_not_ready", 409);
  }
  const now = new Date();
  const [updated] = await db
    .update(schema.providerOfferings)
    .set({
      canonicalModelId: canonical,
      free: input.free,
      costPromptPrice: decimal(input.cost_prompt),
      costCompletionPrice: decimal(input.cost_completion),
      commissionBps: NEXUS_PROVIDER_MARKUP_BPS,
      pricingVerified: true,
      pricingVerifiedBy: actorUserId,
      pricingVerifiedAt: now,
      status: "active",
      updatedAt: now,
    })
    .where(eq(schema.providerOfferings.id, offering.id))
    .returning();
  return updated;
}

export async function listProviderConnectionsForAdmin() {
  await ensureDb();
  const [connections, offerings] = await Promise.all([
    db.select().from(schema.providerConnections).orderBy(asc(schema.providerConnections.label)),
    db.select().from(schema.providerOfferings).orderBy(asc(schema.providerOfferings.displayName)),
  ]);
  return connections.map((connection) => {
    const connectionOfferings = offerings.filter(
      (offering) => offering.connectionId === connection.id,
    );
    return {
      id: connection.id,
      slug: connection.slug,
      label: connection.label,
      protocol: connection.protocol,
      authScheme: connection.authScheme,
      baseUrl: connection.baseUrl,
      modelsPath: connection.modelsPath,
      secretHint: connection.secretHint,
      status: connection.status,
      zdrCapable: connection.zdrCapable,
      zdrVerified: connection.zdrVerified,
      noTrainingVerified: connection.noTrainingVerified,
      privacyPolicyUrl: connection.privacyPolicyUrl,
      termsUrl: connection.termsUrl,
      statusPageUrl: connection.statusPageUrl,
      lastProbeOk: connection.lastProbeOk,
      lastProbeStatus: connection.lastProbeStatus,
      lastProbeLatencyMs: connection.lastProbeLatencyMs,
      lastProbeError: connection.lastProbeError,
      lastProbedAt: connection.lastProbedAt,
      offeringCount: connectionOfferings.length,
      activeOfferingCount: connectionOfferings.filter((offering) => offering.status === "active").length,
      offerings: connectionOfferings
        .slice(0, 200)
        .map((offering) => ({
          id: offering.id,
          providerModelId: offering.providerModelId,
          canonicalModelId: offering.canonicalModelId,
          displayName: offering.displayName,
          providerReady: offering.providerReady,
          free: offering.free,
          reportedPromptPrice: offering.reportedPromptPrice,
          reportedCompletionPrice: offering.reportedCompletionPrice,
          costPromptPrice: offering.costPromptPrice,
          costCompletionPrice: offering.costCompletionPrice,
          commissionBps: offering.commissionBps,
          capacityTpm: offering.capacityTpm,
          status: offering.status,
          pricingVerified: offering.pricingVerified,
          sourceHash: offering.sourceHash,
          updatedAt: offering.updatedAt,
        })),
    };
  });
}

function offeringEndpoint(
  connection: ProviderConnection,
  offering: ProviderOffering,
): ModelEndpoint {
  const prompt = priceWithMarkup(Number(offering.costPromptPrice), offering.commissionBps);
  const completion = priceWithMarkup(Number(offering.costCompletionPrice), offering.commissionBps);
  return {
    name: connection.slug,
    adapter: connection.slug,
    providerModel: offering.providerModelId,
    pricing: { prompt, completion },
    pricingVerified: true,
    free: offering.free,
    latencyMs: connection.lastProbeLatencyMs ?? 0,
    throughputTps: 0,
    zdr: connection.zdrVerified,
    uptime: 0,
    quantization: offering.quantization,
    verified: true,
    metricsEstimated: true,
    providerConnectionId: connection.id,
    providerOfferingId: offering.id,
    providerSourceHash: managedRuntimeContractHash(connection, offering),
    runtimeProtocol: connection.protocol as ManagedProviderProtocol,
    runtimeBaseUrl: connection.baseUrl,
    zdrVerified: connection.zdrVerified,
    noTrainingVerified: connection.noTrainingVerified,
  };
}

function managedRuntimeContractHash(
  connection: ProviderConnection,
  offering: ProviderOffering,
) {
  return sha256(JSON.stringify({
    connectionId: connection.id,
    offeringId: offering.id,
    protocol: connection.protocol,
    baseUrl: connection.baseUrl,
    zdrVerified: connection.zdrVerified,
    noTrainingVerified: connection.noTrainingVerified,
    sourceHash: offering.sourceHash,
    canonicalModelId: offering.canonicalModelId,
    free: offering.free,
    costPromptPrice: offering.costPromptPrice,
    costCompletionPrice: offering.costCompletionPrice,
    commissionBps: offering.commissionBps,
  }));
}

export async function loadManagedProviderModels(): Promise<CatalogModel[]> {
  await ensureDb();
  const rows = await db
    .select({ connection: schema.providerConnections, offering: schema.providerOfferings })
    .from(schema.providerOfferings)
    .innerJoin(
      schema.providerConnections,
      eq(schema.providerOfferings.connectionId, schema.providerConnections.id),
    )
    .where(
      and(
        eq(schema.providerConnections.status, "active"),
        eq(schema.providerConnections.lastProbeOk, true),
        eq(schema.providerOfferings.status, "active"),
        eq(schema.providerOfferings.pricingVerified, true),
        eq(schema.providerOfferings.providerReady, true),
      ),
    );
  const byModel = new Map<string, CatalogModel>();
  for (const { connection, offering } of rows) {
    if (!providerProbeIsFresh(connection)) continue;
    if (offering.deprecationAt && offering.deprecationAt.getTime() <= Date.now()) continue;
    const endpoint = offeringEndpoint(connection, offering);
    const current = byModel.get(offering.canonicalModelId);
    if (current) {
      current.endpoints.push(endpoint);
      current.free = current.free || offering.free;
      current.pricing.prompt = Math.min(current.pricing.prompt, endpoint.pricing.prompt);
      current.pricing.completion = Math.min(current.pricing.completion, endpoint.pricing.completion);
      continue;
    }
    const author = offering.canonicalModelId.split("/")[0] ?? connection.slug;
    byModel.set(offering.canonicalModelId, {
      id: offering.canonicalModelId,
      name: offering.displayName,
      description: offering.description || `${offering.displayName} served by ${connection.label}.`,
      author,
      created: offering.createdUnix,
      contextLength: offering.contextLength,
      architecture: {
        modality: `${offering.inputModalities.join("+")}->${offering.outputModalities.join("+")}`,
        inputModalities: offering.inputModalities,
        outputModalities: offering.outputModalities,
        tokenizer: "Provider",
      },
      pricing: {
        prompt: endpoint.pricing.prompt,
        completion: endpoint.pricing.completion,
        request: 0,
        image: 0,
        webSearch: 0,
        inputCacheRead: 0,
        inputCacheWrite: 0,
      },
      topProvider: {
        contextLength: offering.contextLength,
        maxCompletionTokens: offering.maxCompletionTokens,
        isModerated: false,
      },
      supportedParameters: offering.supportedParameters,
      knowledgeCutoff: null,
      huggingFaceId: null,
      canonicalSlug: offering.canonicalModelId,
      free: offering.free,
      verified: true,
      endpoints: [endpoint],
    });
  }
  return [...byModel.values()];
}

export async function loadActiveProviderCredential(endpoint: ModelEndpoint) {
  if (!endpoint.providerConnectionId || !endpoint.providerOfferingId) return null;
  await ensureDb();
  const [row] = await db
    .select({ connection: schema.providerConnections, offering: schema.providerOfferings })
    .from(schema.providerOfferings)
    .innerJoin(
      schema.providerConnections,
      eq(schema.providerOfferings.connectionId, schema.providerConnections.id),
    )
    .where(
      and(
        eq(schema.providerOfferings.id, endpoint.providerOfferingId),
        eq(schema.providerOfferings.connectionId, endpoint.providerConnectionId),
        eq(schema.providerOfferings.status, "active"),
        eq(schema.providerOfferings.pricingVerified, true),
        eq(schema.providerOfferings.providerReady, true),
        eq(schema.providerConnections.status, "active"),
        eq(schema.providerConnections.lastProbeOk, true),
      ),
    )
    .limit(1);
  if (!row || !providerProbeIsFresh(row.connection)) return null;
  if (endpoint.providerSourceHash !== managedRuntimeContractHash(row.connection, row.offering)) {
    return null;
  }
  return {
    apiKey: decryptSecret(row.connection.encryptedKey),
    protocol: row.connection.protocol as ManagedProviderProtocol,
    baseUrl: row.connection.baseUrl,
  };
}

export async function listPublicManagedProviders() {
  await ensureDb();
  const connections = await db
    .select()
    .from(schema.providerConnections)
    .where(eq(schema.providerConnections.status, "active"))
    .orderBy(asc(schema.providerConnections.label));
  const offerings = await db
    .select()
    .from(schema.providerOfferings)
    .where(eq(schema.providerOfferings.status, "active"));
  return connections.map((connection) => ({
    id: connection.slug,
    label: connection.label,
    kind: connection.protocol,
    operational: providerProbeIsFresh(connection),
    modelCount: offerings.filter(
      (offering) => offering.connectionId === connection.id && offering.pricingVerified,
    ).length,
    zdr: connection.zdrVerified,
    zdrCapable: connection.zdrCapable,
    noTraining: connection.noTrainingVerified,
    privacyPolicyUrl: connection.privacyPolicyUrl,
    termsUrl: connection.termsUrl,
    statusPageUrl: connection.statusPageUrl,
    managed: true as const,
  }));
}

export async function probeActiveProviderConnections(): Promise<
  Record<
    string,
    { ok: boolean; status?: number; latencyMs: number; count?: number; error?: string }
  >
> {
  await ensureDb();
  const connections = await db
    .select({ id: schema.providerConnections.id, slug: schema.providerConnections.slug })
    .from(schema.providerConnections)
    .where(eq(schema.providerConnections.status, "active"));
  return Object.fromEntries(
    await Promise.all(
      connections.map(async (connection) => {
        try {
          const result = await probeProviderConnection(connection.id);
          return [connection.slug, { ok: true, ...result }] as const;
        } catch (error) {
          return [
            connection.slug,
            {
              ok: false,
              status: undefined,
              latencyMs: 0,
              error: error instanceof Error ? error.message : "Provider probe failed",
            },
          ] as const;
        }
      }),
    ),
  );
}
