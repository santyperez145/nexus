/**
 * Nexus Gateway — data plane de inferencia.
 * Escala aparte del dashboard Next.js. En prod: GATEWAY_URL + rewrite.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { ensureDb } from "../src/lib/db";
import { authenticateRequest, jsonError } from "../src/lib/gateway/api-auth";
import { handleChat } from "../src/lib/gateway/handle-chat";
import type { ChatRequest } from "../src/lib/gateway/types";
import { allModels } from "../src/lib/catalog";
import { providerSnapshot } from "../src/lib/gateway/health";
import { embedTexts } from "../src/lib/gateway/providers";

const app = new Hono();
const port = Number(process.env.GATEWAY_PORT ?? 4001);

app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: [
      "Authorization",
      "Content-Type",
      "X-API-Key",
      "HTTP-Referer",
      "X-Title",
      "X-Requested-With",
      "OpenAI-Beta",
      "OpenAI-Organization",
    ],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    exposeHeaders: ["X-Request-Id"],
    maxAge: 86400,
  }),
);

app.get("/healthz", async (c) => {
  const providers = await providerSnapshot();
  return c.json({ ok: true, service: "nexus-gateway", providers });
});

app.get("/v1/models", (c) => c.json({ data: allModels() }));

app.post("/v1/embeddings", async (c) => {
  try {
    await ensureDb();
    await authenticateRequest(c.req.raw);
    const body = (await c.req.json()) as { input?: string | string[]; model?: string };
    const texts = Array.isArray(body.input) ? body.input : [String(body.input ?? "")];
    const vectors = await embedTexts(texts, body.model ?? "openai/text-embedding-3-small");
    return c.json({
      object: "list",
      data: vectors.map((embedding, i) => ({ object: "embedding", index: i, embedding })),
      model: body.model ?? "openai/text-embedding-3-small",
    });
  } catch (error) {
    return jsonError(error);
  }
});

app.post("/v1/chat/completions", async (c) => {
  try {
    await ensureDb();
    const auth = await authenticateRequest(c.req.raw);
    const body = (await c.req.json()) as ChatRequest;
    const res = await handleChat(body, auth, c.req.raw.headers, c.req.raw.signal);
    return res;
  } catch (error) {
    return jsonError(error);
  }
});

app.post("/v1/completions", async (c) => {
  try {
    await ensureDb();
    const auth = await authenticateRequest(c.req.raw);
    const body = (await c.req.json()) as ChatRequest;
    return await handleChat(body, auth, c.req.raw.headers, c.req.raw.signal);
  } catch (error) {
    return jsonError(error);
  }
});

console.log(`Nexus gateway listening on :${port}`);

if (process.env.VERCEL !== "1") {
  serve({ fetch: app.fetch, port });
}

export default app;
