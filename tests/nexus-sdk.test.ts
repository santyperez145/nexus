import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Nexus, NexusError, NEXUS_MODEL_IDS } from "../packages/sdk/src/index";

describe("nexus-sdk", () => {
  it("exposes 425 model ids including routers", () => {
    assert.equal(NEXUS_MODEL_IDS.length, 425);
    assert.ok(NEXUS_MODEL_IDS.includes("nexus/auto"));
    assert.ok(NEXUS_MODEL_IDS.includes("openai/gpt-4o"));
  });

  it("sends chat completions with attribution headers", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const nexus = new Nexus({
      apiKey: "sk-nx-test",
      baseURL: "https://nexus.test/api/v1",
      httpReferer: "https://app.example",
      title: "Demo",
      fetch: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return Response.json({
          id: "gen-1",
          object: "chat.completion",
          created: 1,
          model: "openai/gpt-4o",
          provider: "openai",
          choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "hola" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost: 0 },
        });
      },
    });
    const res = await nexus.chat.send({
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: "Hola" }],
    });
    assert.equal(res.choices[0]?.message.content, "hola");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://nexus.test/api/v1/chat/completions");
    const headers = new Headers(calls[0].init.headers);
    assert.equal(headers.get("authorization"), "Bearer sk-nx-test");
    assert.equal(headers.get("http-referer"), "https://app.example");
    assert.equal(headers.get("x-title"), "Demo");
  });

  it("throws NexusError on 402", async () => {
    const nexus = new Nexus({
      apiKey: "sk-nx-test",
      baseURL: "https://nexus.test/api/v1",
      fetch: async () =>
        Response.json(
          { error: { message: "Insufficient credits", code: "insufficient_credits" } },
          { status: 402 },
        ),
    });
    await assert.rejects(
      () => nexus.credits.get(),
      (err: unknown) => {
        assert.ok(err instanceof NexusError);
        assert.equal(err.status, 402);
        assert.equal(err.code, "insufficient_credits");
        return true;
      },
    );
  });

  it("aliases chat.completions.create", async () => {
    const nexus = new Nexus({
      apiKey: "sk-nx-test",
      baseURL: "https://nexus.test/api/v1",
      fetch: async () =>
        Response.json({
          id: "gen-2",
          object: "chat.completion",
          created: 1,
          model: "nexus/auto",
          choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "ok" } }],
        }),
    });
    const res = await nexus.chat.completions.create({
      model: "nexus/auto",
      messages: [{ role: "user", content: "x" }],
    });
    assert.equal(res.choices[0]?.message.content, "ok");
  });

  it("uploads files as multipart and lists analytics", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const nexus = new Nexus({
      apiKey: "sk-nx-test",
      baseURL: "https://nexus.test/api/v1",
      fetch: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        if (String(url).includes("/files")) {
          return Response.json({ data: { id: "file_1", filename: "nota.txt", bytes: 4 } });
        }
        return Response.json({
          data: { totals: { requests: 1, tokens: 2, cost: 0 }, by_model: [] },
        });
      },
    });
    const uploaded = await nexus.files.upload(new Blob(["hola"]), "nota.txt");
    assert.equal(uploaded.data.id, "file_1");
    assert.ok(calls[0].init.body instanceof FormData);
    const analytics = await nexus.analytics.get();
    assert.equal(analytics.data.totals.requests, 1);
  });
});
