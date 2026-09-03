import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { generationId } from "@/lib/ids";
import { tokenCostUsd, usdToMicros } from "@/lib/money";
import type { ToolSet } from "ai";
import type { AuthContext, ChatMessage, ChatRequest } from "./types";
import { resolveRoute } from "./router";
import { completeChat, estimateTokens, hasProviderKey, streamChat } from "./providers";
import { checkFreeRateLimit, maybeAutoTopup, releaseReserve, reserveCredits, settleUsage } from "./billing";
import { enforceGuardrails } from "./guardrails";
import { isCircuitOpen, recordFailure, recordSuccess } from "./health";
import { assertRateLimit } from "./rate-limit";
import { assertGuestRateLimit } from "./guest";
import { mapToolChoice, mergeTools } from "./client-tools";
import { resolveByokKey } from "./byok";
import { canAccess } from "./tenant";
import { attachUserFiles } from "./files";
import { applyMiddleOut } from "./middle-out";
import { applyPreset } from "./presets";
import { chatChunkPayload, chatCompletionPayload, usagePayload } from "./openai-compat";
import { dispatchGenerationWebhook } from "@/lib/observability/dispatch";

function summarizeRouteHops(plan: ReturnType<typeof resolveRoute>) {
  const hops: Array<{ model: string; adapter: string; zdr: boolean }> = [];
  for (const candidate of plan.models) {
    for (const endpoint of candidate.endpoints) {
      hops.push({
        model: candidate.model.id,
        adapter: endpoint.adapter,
        zdr: Boolean(endpoint.zdr),
      });
      if (hops.length >= 16) return hops;
    }
  }
  return hops;
}

function normalizeMessages(req: ChatRequest): ChatMessage[] {
  if (req.messages?.length) return req.messages;
  if (req.prompt) return [{ role: "user", content: req.prompt }];
  throw Object.assign(new Error("Either messages or prompt is required"), { status: 400 });
}

async function byokFor(auth: AuthContext, provider: string) {
  return resolveByokKey(auth.userId, provider, auth);
}

export async function handleChat(req: ChatRequest, auth: AuthContext, headers: Headers) {
  req = await applyPreset(req, auth.userId);
  await enforceGuardrails(auth, req);
  let messages = normalizeMessages(req);
  messages = await attachUserFiles(auth, req, messages);
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
  await checkFreeRateLimit(auth, first.model.free);
  const estimate = usdToMicros(
    tokenCostUsd(estimateTokens(messages), req.max_tokens ?? 256, first.model.pricing),
  );
  await enforceGuardrails(auth, req, estimate);
  const byokRows = await db
    .select({
      provider: schema.byokCredentials.provider,
      deleted: schema.byokCredentials.deleted,
      userId: schema.byokCredentials.userId,
      workspaceId: schema.byokCredentials.workspaceId,
    })
    .from(schema.byokCredentials)
    .where(eq(schema.byokCredentials.userId, auth.userId));
  const byokProviders = new Set(
    byokRows.filter((r) => !r.deleted && r.provider && canAccess(auth, r)).map((r) => r.provider),
  );
  const anyPlatform = first.endpoints.some((e) => hasProviderKey(e));
  const anyByok = first.endpoints.some(
    (e) => byokProviders.has(e.adapter) || byokProviders.has(e.name),
  );
  const billingOpts = {
    isFree: first.model.free,
    byokFeeOnly: !anyPlatform && anyByok,
  };
  const reservedMicros = await reserveCredits(auth, estimate, billingOpts);

  const started = Date.now();
  const genId = generationId();
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
      const byok =
        (await byokFor(auth, endpoint.adapter)) ?? (await byokFor(auth, endpoint.name));
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
            reservedMicros,
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
        });
        await recordSuccess(endpoint.adapter);
        const billed = await settleUsage({
          auth,
          generationId: genId,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          pricing: endpoint.pricing,
          isFree: candidate.model.free || result.local,
          isByok: Boolean(byok) && !result.local,
          reservedMicros,
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
    if (!settled) await releaseReserve(auth, reservedMicros);
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
  reservedMicros?: number;
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
          const promptTokens = usage.inputTokens ?? estimateTokens(opts.messages);
          const completionTokens = usage.outputTokens ?? estimateTokens(full);
          const billed = await settleUsage({
            auth: opts.auth,
            generationId: opts.genId,
            promptTokens,
            completionTokens,
            pricing: opts.endpoint.pricing,
            isFree: opts.candidate.model.free,
            isByok: Boolean(opts.byok),
            reservedMicros: opts.reservedMicros,
          });
          const includeUsage = opts.req.stream_options?.include_usage === true;
          send(
            chatChunkPayload({
              id: opts.genId,
              model: opts.candidate.model.id,
              provider: opts.endpoint.adapter,
              delta: { content: "" },
              finishReason: "stop",
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
            result: { text: full, promptTokens, completionTokens, finishReason: "stop", local: false },
            costMicros: billed.micros,
            latencyMs: Date.now() - opts.started,
            streamed: true,
            isByok: Boolean(opts.byok),
            messages: opts.messages,
            routeHops: opts.routeHops,
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
            reservedMicros: opts.reservedMicros,
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
          });
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        if (opts.reservedMicros) {
          await releaseReserve(opts.auth, opts.reservedMicros).catch(() => undefined);
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
    prompt: opts.auth.logPrompts ? JSON.stringify(opts.messages) : null,
    completion: opts.auth.logPrompts ? opts.result.text : null,
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
  }).catch(() => undefined);
  await maybeAutoTopup(opts.auth.userId).catch(() => undefined);
}
