import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Nexus, NexusError, NEXUS_MODEL_IDS } from "../packages/sdk/src/index";

describe("nexus-sdk", () => {
  it("exposes catalog model ids including routers", () => {
    assert.ok(NEXUS_MODEL_IDS.length >= 425, `expected >= 425, got ${NEXUS_MODEL_IDS.length}`);
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

  it("calls responses and messages envelopes", async () => {
    const urls: string[] = [];
    const nexus = new Nexus({
      apiKey: "sk-nx-test",
      baseURL: "https://nexus.test/api/v1",
      fetch: async (url) => {
        urls.push(String(url));
        if (String(url).includes("/responses")) {
          return Response.json({
            id: "resp_1",
            object: "response",
            status: "completed",
            output: [{ type: "message", content: [{ type: "output_text", text: "hi" }] }],
          });
        }
        return Response.json({
          id: "msg_1",
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "hola" }],
          stop_reason: "end_turn",
        });
      },
    });
    const r = await nexus.responses.create({ model: "nexus/auto", input: "hi" });
    const m = await nexus.messages.create({
      model: "nexus/auto",
      messages: [{ role: "user", content: "hola" }],
    });
    assert.equal(r.object, "response");
    assert.equal(m.type, "message");
    assert.ok(urls.some((u) => u.endsWith("/responses")));
    assert.ok(urls.some((u) => u.endsWith("/messages")));
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

  it("rotates keys via rotate_id", async () => {
    const nexus = new Nexus({
      apiKey: "sk-nx-test",
      baseURL: "https://nexus.test/api/v1",
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { rotate_id?: string };
        assert.equal(body.rotate_id, "key_1");
        return Response.json({ data: { key: "sk-nx-rotated" } });
      },
    });
    const res = await nexus.keys.rotate("key_1");
    assert.equal(res.data.key, "sk-nx-rotated");
  });

  it("previews routing hops", async () => {
    const nexus = new Nexus({
      apiKey: "sk-nx-test",
      baseURL: "https://nexus.test/api/v1",
      fetch: async (url, init) => {
        assert.ok(String(url).endsWith("/routing/preview"));
        assert.equal(init?.method, "POST");
        return Response.json({
          data: {
            requested: "nexus/auto",
            mode: "local_echo",
            hops: [{ model: "openai/gpt-4o", adapter: "openai", wired: false, zdr: true }],
            note: "preview",
          },
        });
      },
    });
    const res = await nexus.routing.preview({
      model: "nexus/auto",
      messages: [{ role: "user", content: "hi" }],
    });
    assert.equal(res.data.requested, "nexus/auto");
    assert.equal(res.data.hops.length, 1);
  });

  it("lists datasets models and auth key", async () => {
    const calls: string[] = [];
    const nexus = new Nexus({
      apiKey: "sk-nx-test",
      baseURL: "https://nexus.test/api/v1",
      fetch: async (url) => {
        calls.push(String(url));
        if (String(url).includes("/datasets/models")) {
          return Response.json({
            data: [{ model: "openai/gpt-4o", tokens: 10, requests: 2, avg_latency_ms: 120 }],
            window: "7d",
          });
        }
        return Response.json({
          data: { label: "main", is_management: false, limit: 10, usage: 1, limit_remaining: 9 },
        });
      },
    });
    const ds = await nexus.datasets.models({ window: "7d" });
    assert.equal(ds.data[0]?.avg_latency_ms, 120);
    const key = await nexus.auth.key();
    assert.equal(key.data.label, "main");
    assert.ok(calls[0].includes("window=7d"));
    assert.ok(calls[1].endsWith("/auth/key"));
  });

  it("manages versioned dataset repositories without ambiguous paths", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const nexus = new Nexus({
      apiKey: "sk-nx-mgmt-test",
      baseURL: "https://nexus.test/api/v1",
      fetch: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return Response.json({ data: { path: "acme/evals", revision: 1 } }, { status: 201 });
      },
    });
    await nexus.datasets.create({ namespace: "acme", slug: "evals", title: "Evals" });
    await nexus.datasets.revisions.create("acme", "evals", {
      commit_message: "Initial",
      files: [{ file_id: "file_1", path: "data/train.jsonl" }],
    });
    assert.equal(calls[0].url, "https://nexus.test/api/v1/datasets");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[1].url, "https://nexus.test/api/v1/datasets/acme/evals/revisions");
    const revisionBody = JSON.parse(String(calls[1].init.body)) as { files: Array<{ path: string }> };
    assert.equal(revisionBody.files[0].path, "data/train.jsonl");
  });

  it("publishes and executes Spaces through explicit resource paths", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const nexus = new Nexus({
      apiKey: "sk-nx-test",
      baseURL: "https://nexus.test/api/v1",
      fetch: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        if (String(url).endsWith("/run")) {
          return Response.json({
            id: "gen-space",
            object: "chat.completion",
            created: 1,
            model: "nexus/auto",
            choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "done" } }],
          });
        }
        return Response.json({ data: { path: "acme/copilot" } }, { status: 201 });
      },
    });
    await nexus.spaces.create({ namespace: "acme", slug: "copilot", title: "Copilot" });
    const result = await nexus.spaces.run("acme", "copilot", { prompt: "Ship it" });
    assert.equal(calls[0].url, "https://nexus.test/api/v1/spaces");
    assert.equal(calls[1].url, "https://nexus.test/api/v1/spaces/acme/copilot/run");
    assert.equal(result.choices[0]?.message.content, "done");
  });

  it("sends X-Nexus-Guest without bearer when guest:true", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const nexus = new Nexus({
      guest: true,
      baseURL: "https://nexus.test/api/v1",
      fetch: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return Response.json({
          id: "gen-guest",
          object: "chat.completion",
          created: 1,
          model: "nexus/auto",
          provider: "local",
          choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "eco" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost: 0 },
        });
      },
    });
    const res = await nexus.chat.send({
      model: "nexus/auto",
      messages: [{ role: "user", content: "ping" }],
    });
    assert.equal(res.choices[0]?.message.content, "eco");
    const headers = new Headers(calls[0].init.headers);
    assert.equal(headers.get("x-nexus-guest"), "1");
    assert.equal(headers.get("authorization"), null);
  });
});
