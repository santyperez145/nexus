import { db, schema } from "@/lib/db";
import { generationId } from "@/lib/ids";
import type { ToolSet } from "ai";
import type { AuthContext, ChatMessage, ChatRequest } from "./types";
import { resolveRoute } from "./router";
import { completeChat, estimateTokens, hasProviderKey, streamChat } from "./providers";
import {
  checkFreeRateLimit,
  estimateReservationMicros,
  maybeAutoTopup,
  releaseReserve,
  reserveCredits,
  settleUsage,
  type CreditReservation,
} from "./billing";
import { enforceGuardrails } from "./guardrails";
import { isCircuitOpen, recordFailure, recordSuccess } from "./health";
import { assertRateLimit } from "./rate-limit";
import { assertGuestRateLimit } from "./guest";
import { mapToolChoice, mergeTools } from "./client-tools";
import { resolveByokKey } from "./byok";
import { canAccess, userScope } from "./tenant";
import { attachUserFiles } from "./files";
import { applyMiddleOut } from "./middle-out";
import { applyPreset } from "./presets";
import { chatChunkPayload, chatCompletionPayload, usagePayload } from "./openai-compat";
import { dispatchGenerationWebhook } from "@/lib/observability/dispatch";
import { isEndpointZdrConfirmed } from "@/lib/providers/privacy";
import { shouldRetainPayloads } from "@/lib/privacy/retention";

export function isZdrRequest(req: ChatRequest, auth: AuthContext) {
  return Boolean(auth.zdr || req.provider?.zdr || req.provider?.data_collection === "deny");
}

/** BYOK privacy guarantees belong to the credential owner and are not inferred from platform contracts. */
export function canUseByokForRequest(req: ChatRequest, auth: AuthContext) {
  return auth.allowTraining && !isZdrRequest(req, auth);
}

export function assertZdrCompatible(req: ChatRequest, auth: AuthContext) {
  if (!isZdrRequest(req, auth)) return;
  if (req.store === true) {
    throw Object.assign(new Error("store=true is incompatible with ZDR"), {
      status: 400,
      code: "zdr_incompatible",
    });
  }
  if (req.background === true) {
    throw Object.assign(new Error("background=true is incompatible with ZDR"), {
      status: 400,
      code: "zdr_incompatible",
    });
  }
  if (req.prompt_cache_retention === "24h") {
    throw Object.assign(new Error("24h prompt caching is incompatible with ZDR"), {
      status: 400,
      code: "zdr_incompatible",
    });
  }
}

function summarizeRouteHops(plan: ReturnType<typeof resolveRoute>) {
  const hops: Array<{ model: string; adapter: string; zdr: boolean }> = [];
  for (const candidate of plan.models) {
    for (const endpoint of candidate.endpoints) {
      hops.push({
        model: candidate.model.id,
        adapter: endpoint.adapter,
        zdr: isEndpointZdrConfirmed(endpoint),
      });
      if (hops.length >= 16) return hops;
    }
  }
  return hops;
}

function normalizeMessages(req: ChatRequest): ChatMessage[] {
  if (req.messages?.length) {
    return req.messages.map((message) => {
      const rawRole = String(message.role);
      const role: ChatMessage["role"] =
        rawRole === "developer"
          ? "system"
          : rawRole === "function"
            ? "tool"
            : rawRole === "system" || rawRole === "user" || rawRole === "assistant" || rawRole === "tool"
              ? rawRole
              : (() => {
                  throw Object.assign(new Error(`Unsupported message role: ${rawRole}`), {
                    status: 400,
                    code: "invalid_request",
                  });
                })();
      return { ...message, role };
    });
  }
  if (req.prompt) return [{ role: "user", content: req.prompt }];
  throw Object.assign(new Error("Either messages or prompt is required"), { status: 400 });
}

export function validateChatRequest(req: ChatRequest, messages: ChatMessage[]) {
  if (messages.length > 256) {
    throw Object.assign(new Error("Too many messages (max 256)"), { status: 413, code: "invalid_request" });
  }
  if (JSON.stringify(messages).length > 2_000_000) {
    throw Object.assign(new Error("Request transcript is too large (max 2 MB)"), {
      status: 413,
      code: "invalid_request",
    });
  }
  const maxTokens = req.max_tokens ?? req.max_completion_tokens ?? req.reasoning?.max_tokens;
  if (maxTokens != null && (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 131_072)) {
    throw Object.assign(new Error("max_tokens must be an integer between 1 and 131072"), {
      status: 400,
      code: "invalid_request",
    });
  }
  if (req.temperature != null && (!Number.isFinite(req.temperature) || req.temperature < 0 || req.temperature > 2)) {
    throw Object.assign(new Error("temperature must be between 0 and 2"), {
      status: 400,
      code: "invalid_request",
    });
  }
  if ((req.tools?.length ?? 0) > 128 || JSON.stringify(req.tools ?? []).length > 500_000) {
    throw Object.assign(new Error("Tool definitions exceed the request limit"), {
      status: 413,
      code: "invalid_request",
    });
  }
}

async function byokFor(auth: AuthContext, provider: string) {
  return resolveByokKey(auth.userId, provider, auth);
}

export async function handleChat(req: ChatRequest, auth: AuthContext, headers: Headers, signal?: AbortSignal) {
  req = await applyPreset(req, auth);
  await enforceGuardrails(auth, req);
  assertZdrCompatible(req, auth);
  let messages = normalizeMessages(req);
  messages = await attachUserFiles(auth, req, messages);
  validateChatRequest(req, messages);
  if (req.transforms?.includes("middle-out")) {
    messages = applyMiddleOut(messages);
  }
  const plan = resolveRoute(req, auth);
  const routeHops = summarizeRouteHops(plan);
  if (!plan.models.length) {
    throw Object.assign(new Error("No available providers match your routing and privacy settings"), {
      status: 404,
      code: "model_not_found",
    });
  }

  const first = plan.models[0];

  // Guest playground: eco local only (never burn platform/BYOK keys), IP rate-limited.
  if (auth.guest) {
    await assertGuestRateLimit(headers);
    const endpoint = first.endpoints[0];
    if (!endpoint) {
      throw Object.assign(new Error("No endpoint available for guest demo"), { status: 404 });
    }
    const started = Date.now();
    const genId = generationId();
    if (req.stream) {
      return streamCompletion({
        req,
        auth,
        headers,
        messages,
        candidate: first,
        endpoint,
        genId,
        started,
        routeHops,
        forceLocal: true,
        signal,
      });
    }
    const result = await completeChat({
      endpoint,
      messages,
      temperature: req.temperature,
      maxTokens: req.max_tokens ?? req.max_completion_tokens ?? req.reasoning?.max_tokens,
      forceLocal: true,
      seed: req.seed,
      topP: req.top_p,
      topK: req.top_k,
      frequencyPenalty: req.frequency_penalty,
      presencePenalty: req.presence_penalty,
      stop: req.stop,
      responseFormat: req.response_format,
      reasoningEffort: req.reasoning?.effort,
      signal,
    });
    return jsonCompletion(
      chatCompletionPayload({
        id: genId,
        model: first.model.id,
        provider: "local",
        text: result.text,
        finishReason: result.finishReason,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        costUsd: 0,
        isByok: false,
        pricing: endpoint.pricing,
        reasoning: result.reasoning,
        toolCalls: result.toolCalls,
      }),
      genId,
    );
  }

  await assertRateLimit(auth);
  await checkFreeRateLimit(auth, first.endpoints[0]?.free === true);
  const allowByokForRequest = canUseByokForRequest(req, auth);
  const byokRows = allowByokForRequest
    ? await db
        .select({
          provider: schema.byokCredentials.provider,
          deleted: schema.byokCredentials.deleted,
          userId: schema.byokCredentials.userId,
          workspaceId: schema.byokCredentials.workspaceId,
        })
        .from(schema.byokCredentials)
        .where(userScope(auth, schema.byokCredentials.userId, schema.byokCredentials.workspaceId))
    : [];
  const byokProviders = new Set(
    byokRows.filter((r) => !r.deleted && r.provider && canAccess(auth, r)).map((r) => r.provider),
  );
  const allEndpoints = plan.models.flatMap((candidate) => candidate.endpoints);
  const routeIsEntirelyFree =
    allEndpoints.length > 0 && allEndpoints.every((endpoint) => endpoint.free === true);
  const anyPlatform = allEndpoints.some((endpoint) => hasProviderKey(endpoint));
  const anyByok = allEndpoints.some(
    (endpoint) => byokProviders.has(endpoint.adapter) || byokProviders.has(endpoint.name),
  );
  const outputTokens = req.max_tokens ?? req.max_completion_tokens ?? req.reasoning?.max_tokens ?? 256;
  // Reserve against the most expensive concrete fallback using a byte-safe prompt ceiling.
  const estimate = estimateReservationMicros({
    input: messages,
    estimatedInputTokens: estimateTokens(messages),
    outputTokens,
    pricings: allEndpoints
      .filter((endpoint) => endpoint.free !== true)
      .map((endpoint) => endpoint.pricing),
    isFree: routeIsEntirelyFree,
  });
  await enforceGuardrails(auth, req, estimate);
  const billingOpts = {
    isFree: routeIsEntirelyFree,
    byokFeeOnly: !anyPlatform && anyByok,
  };
  const started = Date.now();
  const genId = generationId();
  const reservation = await reserveCredits(auth, genId, estimate, billingOpts);
  let lastError = "All providers failed";
  let lastUnwired: (typeof plan.models)[number]["endpoints"][number] | undefined;
  let settled = false;

  try {
  for (const candidate of plan.models) {
    for (const endpoint of candidate.endpoints) {
      if (await isCircuitOpen(endpoint.adapter)) {
        lastError = `Circuit open for ${endpoint.adapter}`;
        continue;
      }
      const byok = allowByokForRequest
        ? ((await byokFor(auth, endpoint.adapter)) ?? (await byokFor(auth, endpoint.name)))
        : undefined;
      if (!hasProviderKey(endpoint, byok)) {
        lastError = `No API key for provider ${endpoint.adapter}`;
        lastUnwired = endpoint;
        continue;
      }
      const tools = mergeTools(req, candidate.variants);
      try {
        if (req.stream) {
          const streamedRes = await streamCompletion({
            req,
            auth,
            headers,
            messages,
            candidate,
            endpoint,
            byok,
            genId,
            started,
            tools,
            routeHops,
            reservation,
            signal,
          });
          settled = true;
          return streamedRes;
        }
        const result = await completeChat({
          endpoint,
          messages,
          temperature: req.temperature,
          maxTokens: req.max_tokens ?? req.max_completion_tokens ?? req.reasoning?.max_tokens,
          byok,
          tools,
          toolChoice: mapToolChoice(req.tool_choice),
          seed: req.seed,
          topP: req.top_p,
          topK: req.top_k,
          frequencyPenalty: req.frequency_penalty,
          presencePenalty: req.presence_penalty,
          stop: req.stop,
          responseFormat: req.response_format,
          reasoningEffort: req.reasoning?.effort,
          signal,
        });
        await recordSuccess(endpoint.adapter);
        const billed = await settleUsage({
          auth,
          generationId: genId,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          pricing: endpoint.pricing,
          isFree: endpoint.free === true || result.local,
          isByok: Boolean(byok) && !result.local,
          logPrompts: shouldRetainPayloads(auth, isZdrRequest(req, auth)),
          reservation,
        });
        settled = true;
        await persistGeneration({
          genId,
          auth,
          headers,
          requested: plan.requested,
          routed: candidate.model.id,
          provider: endpoint.adapter,
          result,
          costMicros: billed.micros,
          latencyMs: Date.now() - started,
          streamed: false,
          isByok: Boolean(byok) && !result.local,
          messages,
          routeHops,
          logPayloads: shouldRetainPayloads(auth, isZdrRequest(req, auth)),
        });
        return jsonCompletion(
          chatCompletionPayload({
            id: genId,
            model: candidate.model.id,
            provider: endpoint.adapter,
            text: result.text,
            finishReason: result.finishReason,
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
            costUsd: billed.usd,
            isByok: Boolean(byok) && !result.local,
            pricing: endpoint.pricing,
            reasoningTokens: result.reasoningTokens,
            cachedTokens: result.cachedTokens,
            toolCalls: result.toolCalls,
            reasoning: req.include_reasoning === false ? null : result.reasoning,
          }),
          genId,
        );
      } catch (error) {
        await recordFailure(endpoint.adapter);
        lastError = error instanceof Error ? error.message : String(error);
        if (req.provider?.allow_fallbacks === false) {
          throw Object.assign(new Error(lastError), { status: 502, provider: endpoint.adapter });
        }
      }
    }
  }

  throw Object.assign(new Error(lastError), { status: 502, provider: lastUnwired?.adapter, code: "provider_unwired" });
  } finally {
    if (!settled) await releaseReserve(auth, reservation);
  }
}

async function streamCompletion(opts: {
  req: ChatRequest;
  auth: AuthContext;
  headers: Headers;
  messages: ChatMessage[];
  candidate: ReturnType<typeof resolveRoute>["models"][number];
  endpoint: (typeof opts)["candidate"]["endpoints"][number];
  byok?: string;
  forceLocal?: boolean;
  genId: string;
  started: number;
  tools?: ToolSet;
  routeHops?: Array<{ model: string; adapter: string; zdr: boolean }>;
  reservation?: CreditReservation;
  signal?: AbortSignal;
}) {
  const streamed = await streamChat({
    endpoint: opts.endpoint,
    messages: opts.messages,
    temperature: opts.req.temperature,
    maxTokens: opts.req.max_tokens ?? opts.req.max_completion_tokens ?? opts.req.reasoning?.max_tokens,
    byok: opts.byok,
    forceLocal: opts.forceLocal,
    tools: opts.tools,
    toolChoice: mapToolChoice(opts.req.tool_choice),
    seed: opts.req.seed,
    topP: opts.req.top_p,
    topK: opts.req.top_k,
    frequencyPenalty: opts.req.frequency_penalty,
    presencePenalty: opts.req.presence_penalty,
    stop: opts.req.stop,
    signal: opts.signal,
  });

  const encoder = new TextEncoder();
  let full = "";

  const body = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      try {
        if ("textStream" in streamed && streamed.textStream) {
          for await (const delta of streamed.textStream) {
            full += delta;
            send(
              chatChunkPayload({
                id: opts.genId,
                model: opts.candidate.model.id,
                provider: opts.endpoint.adapter,
                delta: { role: "assistant", content: delta },
                finishReason: null,
              }),
            );
          }
          const usage = await streamed.usage;
          const finishReason = (await streamed.finishReason) ?? "stop";
          const toolCalls = await streamed.toolCalls;
          const promptTokens = usage.inputTokens ?? estimateTokens(opts.messages);
          const completionTokens = usage.outputTokens ?? estimateTokens(full);
          const billed = await settleUsage({
            auth: opts.auth,
            generationId: opts.genId,
            promptTokens,
            completionTokens,
            pricing: opts.endpoint.pricing,
            isFree: opts.endpoint.free === true,
            isByok: Boolean(opts.byok),
            logPrompts: shouldRetainPayloads(opts.auth, isZdrRequest(opts.req, opts.auth)),
            reservation: opts.reservation,
          });
          const includeUsage = opts.req.stream_options?.include_usage === true;
          if (toolCalls.length) {
            send(
              chatChunkPayload({
                id: opts.genId,
                model: opts.candidate.model.id,
                provider: opts.endpoint.adapter,
                delta: { tool_calls: toolCalls },
                finishReason: null,
              }),
            );
          }
          send(
            chatChunkPayload({
              id: opts.genId,
              model: opts.candidate.model.id,
              provider: opts.endpoint.adapter,
              delta: { content: "" },
              finishReason,
              usage: includeUsage
                ? usagePayload({
                    promptTokens,
                    completionTokens,
                    costUsd: billed.usd,
                    isByok: Boolean(opts.byok),
                    pricing: opts.endpoint.pricing,
                  })
                : undefined,
            }),
          );
          await persistGeneration({
            genId: opts.genId,
            auth: opts.auth,
            headers: opts.headers,
            requested: opts.req.model ?? "nexus/auto",
            routed: opts.candidate.model.id,
            provider: opts.endpoint.adapter,
            result: { text: full, promptTokens, completionTokens, finishReason, local: false },
            costMicros: billed.micros,
            latencyMs: Date.now() - opts.started,
            streamed: true,
            isByok: Boolean(opts.byok),
            messages: opts.messages,
            routeHops: opts.routeHops,
            logPayloads: shouldRetainPayloads(opts.auth, isZdrRequest(opts.req, opts.auth)),
          });
        } else if ("text" in streamed) {
          full = streamed.text;
          const promptTokens = streamed.promptTokens ?? estimateTokens(opts.messages);
          const completionTokens = streamed.completionTokens ?? estimateTokens(full);
          const billed = await settleUsage({
            auth: opts.auth,
            generationId: opts.genId,
            promptTokens,
            completionTokens,
            pricing: opts.endpoint.pricing,
            isFree: true,
            isByok: false,
            logPrompts: false,
            reservation: opts.reservation,
          });
          const includeUsage = opts.req.stream_options?.include_usage === true;
          send(
            chatChunkPayload({
              id: opts.genId,
              model: opts.candidate.model.id,
              provider: "local",
              delta: { role: "assistant", content: full },
              finishReason: "stop",
              usage: includeUsage
                ? usagePayload({
                    promptTokens,
                    completionTokens,
                    costUsd: 0,
                    isByok: false,
                    pricing: opts.endpoint.pricing,
                  })
                : undefined,
            }),
          );
          await persistGeneration({
            genId: opts.genId,
            auth: opts.auth,
            headers: opts.headers,
            requested: opts.req.model ?? "nexus/auto",
            routed: opts.candidate.model.id,
            provider: "local",
            result: {
              text: full,
              promptTokens,
              completionTokens,
              finishReason: "stop",
              local: true,
            },
            costMicros: billed.micros,
            latencyMs: Date.now() - opts.started,
            streamed: true,
            isByok: false,
            messages: opts.messages,
            routeHops: opts.routeHops,
            logPayloads: false,
          });
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        if (opts.reservation?.reservedMicros) {
          await releaseReserve(opts.auth, opts.reservation).catch(() => undefined);
        }
        controller.error(error);
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Request-Id": opts.genId,
    },
  });
}

function jsonCompletion(payload: unknown, genId: string) {
  return Response.json(payload, { headers: { "X-Request-Id": genId } });
}

async function persistGeneration(opts: {
  genId: string;
  auth: AuthContext;
  headers: Headers;
  requested: string;
  routed: string;
  provider: string;
  result: {
    text: string;
    promptTokens: number;
    completionTokens: number;
    finishReason: string;
    local: boolean;
    reasoningTokens?: number;
    cachedTokens?: number;
  };
  costMicros: number;
  latencyMs: number;
  streamed: boolean;
  isByok: boolean;
  messages: ChatMessage[];
  routeHops?: Array<{ model: string; adapter: string; zdr: boolean }>;
  logPayloads?: boolean;
}) {
  if (opts.auth.guest) return;
  await db.insert(schema.generations).values({
    id: opts.genId,
    userId: opts.auth.userId,
    apiKeyId: opts.auth.apiKeyId,
    workspaceId: opts.auth.workspaceId,
    requestedModel: opts.requested,
    routedModel: opts.routed,
    provider: opts.provider,
    finishReason: opts.result.finishReason,
    promptTokens: opts.result.promptTokens,
    completionTokens: opts.result.completionTokens,
    reasoningTokens: opts.result.reasoningTokens ?? 0,
    costMicros: opts.costMicros,
    latencyMs: opts.latencyMs,
    streamed: opts.streamed,
    isByok: opts.isByok,
    appReferer: opts.headers.get("http-referer") ?? opts.headers.get("referer"),
    appTitle: opts.headers.get("x-nexus-title") ?? opts.headers.get("x-title"),
    prompt: opts.logPayloads ? JSON.stringify(opts.messages) : null,
    completion: opts.logPayloads ? opts.result.text : null,
    metadata: {
      local: opts.result.local,
      cached_tokens: opts.result.cachedTokens ?? 0,
      route_hops: opts.routeHops ?? [],
    },
  });
  await dispatchGenerationWebhook(opts.auth.userId, {
    id: opts.genId,
    model: opts.routed,
    provider: opts.provider,
    cost_micros: opts.costMicros,
    latency_ms: opts.latencyMs,
  }, opts.auth.workspaceId).catch((error) => {
    console.error("Failed to enqueue chat observability delivery", {
      generationId: opts.genId,
      message: error instanceof Error ? error.message : "unknown",
    });
  });
  await maybeAutoTopup(opts.auth.billingUserId ?? opts.auth.userId).catch((error) => {
    console.error("Chat auto top-up failed", {
      generationId: opts.genId,
      message: error instanceof Error ? error.message : "unknown",
    });
  });
}
