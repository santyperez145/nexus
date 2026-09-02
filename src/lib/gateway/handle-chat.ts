import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { generationId } from "@/lib/ids";
import { decryptSecret } from "@/lib/crypto";
import { tokenCostUsd, usdToMicros } from "@/lib/money";
import type { AuthContext, ChatMessage, ChatRequest } from "./types";
import { resolveRoute } from "./router";
import { completeChat, estimateTokens, hasProviderKey, streamChat } from "./providers";
import { assertCredits, checkFreeRateLimit, maybeAutoTopup, settleUsage } from "./billing";
import { enforceGuardrails } from "./guardrails";
import { isCircuitOpen, recordFailure, recordSuccess } from "./health";
import { assertRateLimit } from "./rate-limit";
import { buildServerTools } from "./server-tools";
import { dispatchGenerationWebhook } from "@/lib/observability/dispatch";

function normalizeMessages(req: ChatRequest): ChatMessage[] {
  if (req.messages?.length) return req.messages;
  if (req.prompt) return [{ role: "user", content: req.prompt }];
  throw Object.assign(new Error("Either messages or prompt is required"), { status: 400 });
}

async function byokFor(userId: string, provider: string) {
  const creds = await db
    .select()
    .from(schema.byokCredentials)
    .where(eq(schema.byokCredentials.userId, userId));
  const match = creds.find((c) => !c.deleted && c.provider === provider);
  if (!match) return undefined;
  return decryptSecret(match.encryptedKey);
}

export async function handleChat(req: ChatRequest, auth: AuthContext, headers: Headers) {
  await enforceGuardrails(auth, req);
  const messages = normalizeMessages(req);
  const plan = resolveRoute(req, auth);
  if (!plan.models.length) {
    throw Object.assign(new Error("No available providers match your routing and privacy settings"), {
      status: 404,
    });
  }

  const first = plan.models[0];
  await assertRateLimit(auth);
  await checkFreeRateLimit(auth, first.model.free);
  const estimate = usdToMicros(
    tokenCostUsd(estimateTokens(messages), req.max_tokens ?? 256, first.model.pricing),
  );
  await assertCredits(auth, estimate, first.model.free);

  const started = Date.now();
  const genId = generationId();
  let lastError = "All providers failed";
  let attemptedLive = false;
  let lastUnwired: (typeof plan.models)[number]["endpoints"][number] | undefined;
  let lastUnwiredModel: (typeof plan.models)[number] | undefined;

  for (const candidate of plan.models) {
    for (const endpoint of candidate.endpoints) {
      if (await isCircuitOpen(endpoint.adapter)) {
        lastError = `Circuit open for ${endpoint.adapter}`;
        continue;
      }
      const byok =
        (await byokFor(auth.userId, endpoint.adapter)) ?? (await byokFor(auth.userId, endpoint.name));
      if (!hasProviderKey(endpoint, byok)) {
        lastError = `No API key for provider ${endpoint.adapter}`;
        lastUnwired = endpoint;
        lastUnwiredModel = candidate;
        continue;
      }
      attemptedLive = true;
      const tools = buildServerTools(req, candidate.variants);
      try {
        if (req.stream) {
          return streamCompletion({
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
          });
        }
        const result = await completeChat({
          endpoint,
          messages,
          temperature: req.temperature,
          maxTokens: req.max_tokens ?? req.max_completion_tokens,
          byok,
          tools,
          seed: req.seed,
          topP: req.top_p,
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
        });
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
        });
        return Response.json({
          id: genId,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: candidate.model.id,
          provider: endpoint.adapter,
          choices: [
            {
              index: 0,
              finish_reason: result.finishReason,
              native_finish_reason: result.finishReason,
              message: { role: "assistant", content: result.text },
            },
          ],
          usage: {
            prompt_tokens: result.promptTokens,
            completion_tokens: result.completionTokens,
            total_tokens: result.promptTokens + result.completionTokens,
            cost: billed.usd,
            is_byok: Boolean(byok) && !result.local,
            cost_details: {
              upstream_inference_prompt_cost: result.promptTokens * endpoint.pricing.prompt,
              upstream_inference_completions_cost: result.completionTokens * endpoint.pricing.completion,
            },
          },
        });
      } catch (error) {
        await recordFailure(endpoint.adapter);
        lastError = error instanceof Error ? error.message : String(error);
        if (req.provider?.allow_fallbacks === false) break;
      }
    }
  }

  if (!attemptedLive && lastUnwired && lastUnwiredModel) {
    const endpoint = lastUnwired;
    const candidate = lastUnwiredModel;
    if (req.stream) {
      return streamCompletion({
        req,
        auth,
        headers,
        messages,
        candidate,
        endpoint,
        genId,
        started,
      });
    }
    const result = await completeChat({
      endpoint,
      messages,
      temperature: req.temperature,
      maxTokens: req.max_tokens ?? req.max_completion_tokens,
      tools: buildServerTools(req, candidate.variants),
      seed: req.seed,
      topP: req.top_p,
    });
    const billed = await settleUsage({
      auth,
      generationId: genId,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      pricing: endpoint.pricing,
      isFree: true,
      isByok: false,
    });
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
      isByok: false,
      messages,
    });
    return Response.json({
      id: genId,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: candidate.model.id,
      provider: "local",
      choices: [
        {
          index: 0,
          finish_reason: result.finishReason,
          native_finish_reason: result.finishReason,
          message: { role: "assistant", content: result.text },
        },
      ],
      usage: {
        prompt_tokens: result.promptTokens,
        completion_tokens: result.completionTokens,
        total_tokens: result.promptTokens + result.completionTokens,
        cost: 0,
        is_byok: false,
      },
    });
  }

  throw Object.assign(new Error(lastError), { status: 502 });
}

async function streamCompletion(opts: {
  req: ChatRequest;
  auth: AuthContext;
  headers: Headers;
  messages: ChatMessage[];
  candidate: ReturnType<typeof resolveRoute>["models"][number];
  endpoint: (typeof opts)["candidate"]["endpoints"][number];
  byok?: string;
  genId: string;
  started: number;
  tools?: ReturnType<typeof buildServerTools>;
}) {
  const streamed = await streamChat({
    endpoint: opts.endpoint,
    messages: opts.messages,
    temperature: opts.req.temperature,
    maxTokens: opts.req.max_tokens ?? opts.req.max_completion_tokens,
    byok: opts.byok,
    tools: opts.tools,
    seed: opts.req.seed,
    topP: opts.req.top_p,
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
            send({
              id: opts.genId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: opts.candidate.model.id,
              choices: [
                {
                  index: 0,
                  delta: { role: "assistant", content: delta },
                  finish_reason: null,
                  native_finish_reason: null,
                },
              ],
            });
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
          });
          send({
            id: opts.genId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: opts.candidate.model.id,
            choices: [
              {
                index: 0,
                delta: { content: "" },
                finish_reason: "stop",
                native_finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: promptTokens + completionTokens,
              cost: billed.usd,
            },
          });
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
          });
        } else {
          full = streamed.text;
          send({
            id: opts.genId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: opts.candidate.model.id,
            choices: [
              {
                index: 0,
                delta: { role: "assistant", content: full },
                finish_reason: "stop",
                native_finish_reason: "stop",
              },
            ],
          });
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

async function persistGeneration(opts: {
  genId: string;
  auth: AuthContext;
  headers: Headers;
  requested: string;
  routed: string;
  provider: string;
  result: { text: string; promptTokens: number; completionTokens: number; finishReason: string; local: boolean };
  costMicros: number;
  latencyMs: number;
  streamed: boolean;
  isByok: boolean;
  messages: ChatMessage[];
}) {
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
    costMicros: opts.costMicros,
    latencyMs: opts.latencyMs,
    streamed: opts.streamed,
    isByok: opts.isByok,
    appReferer: opts.headers.get("http-referer") ?? opts.headers.get("referer"),
    appTitle: opts.headers.get("x-nexus-title") ?? opts.headers.get("x-title"),
    prompt: opts.auth.logPrompts ? JSON.stringify(opts.messages) : null,
    completion: opts.auth.logPrompts ? opts.result.text : null,
    metadata: { local: opts.result.local },
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
