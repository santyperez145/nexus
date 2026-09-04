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
import { inferencePlaneReady, readinessSnapshot } from "../src/lib/health/readiness";
import { POST as embeddingsPost } from "../src/app/api/v1/embeddings/route";
import { GET as modelsGet } from "../src/app/api/v1/models/route";
import { POST as responsesPost } from "../src/app/api/v1/responses/route";
import { POST as messagesPost } from "../src/app/api/v1/messages/route";
import { DATA_PLANE_PROTOCOL_ROUTES } from "../src/lib/gateway/data-plane";

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
      "X-Nexus-Guest",
      "OpenAI-Beta",
      "OpenAI-Organization",
    ],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    exposeHeaders: ["X-Request-Id"],
    maxAge: 86400,
  }),
);

app.get("/healthz", (c) => {
  return c.json({ ok: true, service: "nexus-gateway", checkedAt: new Date().toISOString() });
});

app.get("/readyz", async (c) => {
  const snapshot = await readinessSnapshot();
  const ready = inferencePlaneReady(snapshot);
  return c.json(
    { ...snapshot, infrastructureOk: snapshot.ok, ok: ready, service: "nexus-gateway" },
    ready ? 200 : 503,
  );
});

app.get("/v1/models", (c) => modelsGet(c.req.raw));

// Keep the independently-scaled data plane on the exact same auth, rate-limit,
// billing and protocol code paths as the Next.js control plane.
app.post(DATA_PLANE_PROTOCOL_ROUTES.embeddings, (c) => embeddingsPost(c.req.raw));
app.post(DATA_PLANE_PROTOCOL_ROUTES.responses, (c) => responsesPost(c.req.raw));
app.post(DATA_PLANE_PROTOCOL_ROUTES.messages, (c) => messagesPost(c.req.raw));

app.post(DATA_PLANE_PROTOCOL_ROUTES.chat, async (c) => {
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

app.post(DATA_PLANE_PROTOCOL_ROUTES.completions, async (c) => {
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
