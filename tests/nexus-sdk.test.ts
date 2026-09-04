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

  it("runs the reserve, signed PUT, and verify flow for large artifacts", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const nexus = new Nexus({
      apiKey: "sk-nx-test",
      baseURL: "https://nexus.test/api/v1",
      fetch: async (url, init) => {
        const target = String(url);
        calls.push({ url: target, init: init ?? {} });
        if (target === "https://storage.example/upload") return new Response(null, { status: 200 });
        if (target.endsWith("/files/uploads/file_large/complete")) {
          return Response.json({ data: { id: "file_large", status: "ready" } });
        }
        return Response.json({
          data: {
            id: "file_large",
            filename: "model.safetensors",
            bytes: 10,
            status: "pending",
            storage_backend: "s3",
            sha256: "a".repeat(64),
            upload: {
              strategy: "single",
              method: "PUT",
              url: "https://storage.example/upload",
              headers: { "x-amz-checksum-sha256": "checksum" },
              expires_at: new Date().toISOString(),
            },
          },
        });
      },
    });
    const completed = await nexus.files.uploadArtifact(new Blob(["0123456789"]), {
      filename: "model.safetensors",
      sha256: "a".repeat(64),
    });
    assert.deepEqual(completed.data, { id: "file_large", status: "ready" });
    assert.equal(calls[0].url, "https://nexus.test/api/v1/files/uploads");
    assert.equal(calls[1].url, "https://storage.example/upload");
    assert.equal(new Headers(calls[1].init.headers).get("authorization"), null);
    assert.equal(calls[2].url, "https://nexus.test/api/v1/files/uploads/file_large/complete");
  });

  it("uploads large artifacts through checksum-bound retryable parts", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const nexus = new Nexus({
      apiKey: "sk-nx-test",
      baseURL: "https://nexus.test/api/v1",
      fetch: async (url, init) => {
        const target = String(url);
        calls.push({ url: target, init: init ?? {} });
        if (target.includes("storage.example/part-")) return new Response(null, { status: 200 });
        if (target.endsWith("/files/uploads/file_multipart/parts")) {
          const body = JSON.parse(String(init?.body)) as {
            parts: Array<{ part_number: number; sha256: string }>;
          };
          return Response.json({
            data: body.parts.map((part) => ({
              part_number: part.part_number,
              bytes: part.part_number === 3 ? 2 : 4,
              sha256: part.sha256,
              method: "PUT",
              url: `https://storage.example/part-${part.part_number}`,
              headers: { "x-amz-checksum-sha256": `checksum-${part.part_number}` },
              expires_in: 900,
            })),
          });
        }
        if (target.endsWith("/files/uploads/file_multipart/complete")) {
          return Response.json({ data: { id: "file_multipart", status: "ready" } });
        }
        return Response.json({
          data: {
            id: "file_multipart",
            filename: "model.gguf",
            bytes: 10,
            status: "pending",
            storage_backend: "s3",
            sha256: "b".repeat(64),
            upload: {
              strategy: "multipart",
              part_size: 4,
              part_count: 3,
              parts_url: "/api/v1/files/uploads/file_multipart/parts",
              expires_at: new Date().toISOString(),
            },
          },
        });
      },
    });
    const completed = await nexus.files.uploadArtifact(new Blob(["0123456789"]), {
      filename: "model.gguf",
      sha256: "b".repeat(64),
    });
    assert.deepEqual(completed.data, { id: "file_multipart", status: "ready" });
    const storageCalls = calls.filter((call) => call.url.includes("storage.example/part-"));
    assert.deepEqual(
      storageCalls.map((call) => call.url),
      [
        "https://storage.example/part-1",
        "https://storage.example/part-2",
        "https://storage.example/part-3",
      ],
    );
    assert.deepEqual(
      await Promise.all(storageCalls.map((call) => new Response(call.init.body).text())),
      ["0123", "4567", "89"],
    );
    assert.ok(storageCalls.every((call) => new Headers(call.init.headers).get("authorization") === null));
    const signatureCall = calls.find((call) => call.url.endsWith("/file_multipart/parts"));
    const signatureBody = JSON.parse(String(signatureCall?.init.body)) as {
      parts: Array<{ part_number: number; sha256: string }>;
    };
    assert.deepEqual(signatureBody.parts.map((part) => part.part_number), [1, 2, 3]);
    assert.ok(signatureBody.parts.every((part) => /^[a-f0-9]{64}$/.test(part.sha256)));
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

  it("manages reference-only model repositories without conflating runtime models", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const nexus = new Nexus({
      apiKey: "sk-nx-mgmt-test",
      baseURL: "https://nexus.test/api/v1",
      fetch: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return Response.json({ data: { path: "acme/spanish-7b", revision: 1 } }, { status: 201 });
      },
    });
    await nexus.models.repositories.create({ namespace: "acme", slug: "spanish-7b", title: "Spanish 7B" });
    await nexus.models.repositories.revisions.create("acme", "spanish-7b", {
      commit_message: "Publish weights",
      files: [{ file_id: "file_1", path: "weights/model.safetensors" }],
    });
    await nexus.models.repositories.evaluations.create("acme", "spanish-7b", {
      revision: 1,
      benchmark: "MMLU-Pro",
      task: "text-generation",
      dataset: "TIGER-Lab/MMLU-Pro",
      metric: "accuracy",
      metric_value: 0.71,
      evaluator: "lm-evaluation-harness",
      evidence_url: "https://example.com/results.json",
      evidence_sha256: "a".repeat(64),
    });
    await nexus.models.repositories.promotions.create("acme", "spanish-7b", {
      revision: 1,
      runtime_model_id: "meta-llama/llama-3.3-70b-instruct",
    });
    assert.equal(calls[0].url, "https://nexus.test/api/v1/models");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[1].url, "https://nexus.test/api/v1/models/acme/spanish-7b/revisions");
    assert.equal(calls[2].url, "https://nexus.test/api/v1/models/acme/spanish-7b/evaluations");
    assert.equal(calls[3].url, "https://nexus.test/api/v1/models/acme/spanish-7b/promotions");
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
