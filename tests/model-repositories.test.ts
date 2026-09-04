import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "nexus-model-repositories-test-"));
process.env.ENABLE_PGLITE = "true";
process.env.PGLITE_DATA_DIR = dataDir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.POSTGRES_PRISMA_URL;

const ownerToken = "sk-nx-mgmt-model-owner";
const readerToken = "sk-nx-mgmt-model-reader";
const inferenceToken = "sk-nx-model-owner-inference";
let database: typeof import("../src/lib/db");
let catalog: typeof import("../src/app/api/v1/models/route");
let detail: typeof import("../src/app/api/v1/models/[...slug]/route");
let revisions: typeof import("../src/app/api/v1/models/[namespace]/[slug]/revisions/route");
let evaluations: typeof import("../src/app/api/v1/models/[namespace]/[slug]/evaluations/route");
let promotions: typeof import("../src/app/api/v1/models/[namespace]/[slug]/promotions/route");
let governance: typeof import("../src/lib/hub/model-governance");
let access: typeof import("../src/app/api/v1/models/[namespace]/[slug]/access/route");
let resolveFile: typeof import("../src/app/api/v1/models/[namespace]/[slug]/resolve/[revision]/[...path]/route");
let datasets: typeof import("../src/app/api/v1/datasets/route");
let files: typeof import("../src/app/api/v1/files/route");

function modelRequest(path: string, token?: string, init?: RequestInit) {
  return new Request(`https://nexus.test/api/v1/models${path}`, {
    ...init,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
}

function context(namespace: string, slug: string) {
  return { params: Promise.resolve({ namespace, slug }) };
}

function catchAll(namespace: string, slug: string) {
  return { params: Promise.resolve({ slug: [namespace, slug] }) };
}

before(async () => {
  database = await import("../src/lib/db");
  const { sha256 } = await import("../src/lib/crypto");
  catalog = await import("../src/app/api/v1/models/route");
  detail = await import("../src/app/api/v1/models/[...slug]/route");
  revisions = await import("../src/app/api/v1/models/[namespace]/[slug]/revisions/route");
  evaluations = await import("../src/app/api/v1/models/[namespace]/[slug]/evaluations/route");
  promotions = await import("../src/app/api/v1/models/[namespace]/[slug]/promotions/route");
  governance = await import("../src/lib/hub/model-governance");
  access = await import("../src/app/api/v1/models/[namespace]/[slug]/access/route");
  resolveFile = await import(
    "../src/app/api/v1/models/[namespace]/[slug]/resolve/[revision]/[...path]/route"
  );
  datasets = await import("../src/app/api/v1/datasets/route");
  files = await import("../src/app/api/v1/files/route");
  await database.ensureDb();
  await database.db.insert(database.schema.users).values([
    { id: "usr_model_owner", name: "Model Owner", email: "model-owner@nexus.test", plan: "pro" },
    { id: "usr_model_reader", name: "Model Reader", email: "model-reader@nexus.test", plan: "pro" },
    { id: "usr_model_admin", name: "Model Admin", email: "model-admin@nexus.test", plan: "team" },
  ]);
  await database.db.insert(database.schema.apiKeys).values([
    {
      id: "key_model_owner",
      userId: "usr_model_owner",
      name: "Model owner",
      keyHash: sha256(ownerToken),
      keyPrefix: ownerToken,
      isManagement: true,
      scopes: ["models:read", "models:write", "datasets:read", "datasets:write", "files:read", "files:write"],
    },
    {
      id: "key_model_reader",
      userId: "usr_model_reader",
      name: "Model reader",
      keyHash: sha256(readerToken),
      keyPrefix: readerToken,
      isManagement: true,
      scopes: ["models:read", "models:write"],
    },
    {
      id: "key_model_inference",
      userId: "usr_model_owner",
      name: "Inference only",
      keyHash: sha256(inferenceToken),
      keyPrefix: inferenceToken,
      isManagement: false,
      scopes: ["inference:write"],
    },
  ]);
  await database.db.insert(database.schema.files).values([
    {
      id: "file_model_owner",
      userId: "usr_model_owner",
      filename: "model.safetensors",
      mime: "application/octet-stream",
      size: 7,
      content: Buffer.from("weights").toString("base64"),
      checksumSha256: "9a129038d9a00aed0cf6a7ea059ca50a813449061ab87848cf1a13eafdf33b2c",
    },
    {
      id: "file_model_reader",
      userId: "usr_model_reader",
      filename: "foreign.bin",
      mime: "application/octet-stream",
      size: 7,
      content: Buffer.from("foreign").toString("base64"),
    },
    {
      id: "file_model_pending",
      userId: "usr_model_owner",
      filename: "pending.safetensors",
      mime: "application/octet-stream",
      size: 128,
      storageBackend: "s3",
      storageKey: "nexus-artifacts/users/usr_model_owner/file_model_pending",
      checksumSha256: "a".repeat(64),
      status: "pending",
      uploadExpiresAt: new Date(Date.now() + 60_000),
    },
  ]);
});

after(() => rmSync(dataDir, { recursive: true, force: true }));

describe("versioned model repositories", () => {
  it("keeps publication reference-only and allows dataset/model paths to coexist", async () => {
    const dataset = await datasets.POST(
      new Request("https://nexus.test/api/v1/datasets", {
        method: "POST",
        headers: { authorization: `Bearer ${ownerToken}`, "content-type": "application/json" },
        body: JSON.stringify({ namespace: "Nexus Community", slug: "spanish-7b", title: "Training corpus" }),
      }),
    );
    assert.equal(dataset.status, 201);

    const created = await catalog.POST(
      modelRequest("", ownerToken, {
        method: "POST",
        body: JSON.stringify({
          namespace: "Nexus Community",
          slug: "spanish-7b",
          title: "Spanish 7B",
          model_card: "# Spanish 7B\nEvaluation and limitations.",
          license: "apache-2.0",
          pipeline_tag: "text-generation",
          library_name: "transformers",
          tags: ["spanish", "7b"],
        }),
      }),
    );
    assert.equal(created.status, 201);
    const createdJson = (await created.json()) as {
      data: { path: string; nexus: { executable: boolean; reference_only: boolean } };
    };
    assert.equal(createdJson.data.path, "nexus-community/spanish-7b");
    assert.equal(createdJson.data.nexus.executable, false);
    assert.equal(createdJson.data.nexus.reference_only, true);

    const defaultCatalog = await catalog.GET(modelRequest(""));
    const defaultJson = (await defaultCatalog.json()) as { data: Array<{ id: string }> };
    assert.equal(defaultJson.data.some((row) => row.id === createdJson.data.path), false);

    const references = await catalog.GET(modelRequest("?include_reference=true"));
    const referenceJson = (await references.json()) as {
      data: Array<{ id: string; nexus: { source?: string; executable: boolean; providers: string[] } }>;
    };
    const published = referenceJson.data.find((row) => row.id === createdJson.data.path);
    assert.equal(published?.nexus.source, "hub");
    assert.equal(published?.nexus.executable, false);
    assert.deepEqual(published?.nexus.providers, []);

    const { findModel } = await import("../src/lib/catalog");
    assert.equal(findModel(createdJson.data.path), undefined);
  });

  it("enforces exact file tenant ownership and immutable revisions", async () => {
    const foreign = await revisions.POST(
      modelRequest("/nexus-community/spanish-7b/revisions", ownerToken, {
        method: "POST",
        body: JSON.stringify({
          commit_message: "Try foreign weights",
          files: [{ file_id: "file_model_reader", path: "weights/model.safetensors" }],
        }),
      }),
      context("nexus-community", "spanish-7b"),
    );
    assert.equal(foreign.status, 404);

    const pending = await revisions.POST(
      modelRequest("/nexus-community/spanish-7b/revisions", ownerToken, {
        method: "POST",
        body: JSON.stringify({
          commit_message: "Do not publish incomplete weights",
          files: [{ file_id: "file_model_pending", path: "weights/pending.safetensors" }],
        }),
      }),
      context("nexus-community", "spanish-7b"),
    );
    assert.equal(pending.status, 409);
    const pendingJson = (await pending.json()) as { error: { code: string } };
    assert.equal(pendingJson.error.code, "artifact_not_ready");

    const created = await revisions.POST(
      modelRequest("/nexus-community/spanish-7b/revisions", ownerToken, {
        method: "POST",
        body: JSON.stringify({
          commit_message: "Publish safe tensors",
          metadata: { format: "safetensors", reference_only: true },
          files: [{ file_id: "file_model_owner", path: "weights/model.safetensors" }],
        }),
      }),
      context("nexus-community", "spanish-7b"),
    );
    assert.equal(created.status, 201);
    const createdJson = (await created.json()) as {
      data: {
        revision: number;
        commit_sha: string;
        metadata: { nexus: { reference_only: boolean; executable: boolean; model_card: string } };
      };
    };
    assert.equal(createdJson.data.revision, 1);
    assert.match(createdJson.data.commit_sha, /^[a-f0-9]{16}$/);
    assert.equal(createdJson.data.metadata.nexus.reference_only, true);
    assert.equal(createdJson.data.metadata.nexus.executable, false);
    assert.match(createdJson.data.metadata.nexus.model_card, /Evaluation and limitations/);

    const downloaded = await resolveFile.GET(
      modelRequest("/nexus-community/spanish-7b/resolve/1/weights/model.safetensors"),
      {
        params: Promise.resolve({
          namespace: "nexus-community",
          slug: "spanish-7b",
          revision: "1",
          path: ["weights", "model.safetensors"],
        }),
      },
    );
    assert.equal(downloaded.status, 200);
    assert.equal(await downloaded.text(), "weights");
    assert.equal(downloaded.headers.get("cache-control"), "public, max-age=31536000, immutable");

    const deleteReferenced = await files.DELETE(
      new Request("https://nexus.test/api/v1/files?id=file_model_owner", {
        method: "DELETE",
        headers: { authorization: `Bearer ${ownerToken}` },
      }),
    );
    assert.equal(deleteReferenced.status, 409);
  });

  it("keeps private metadata closed to inference keys and gates public artifacts", async () => {
    const privateRepo = await catalog.POST(
      modelRequest("", ownerToken, {
        method: "POST",
        body: JSON.stringify({ namespace: "nexus-community", slug: "private-weights", title: "Private weights", visibility: "private" }),
      }),
    );
    assert.equal(privateRepo.status, 201);
    const inferenceRead = await detail.GET(
      modelRequest("/nexus-community/private-weights", inferenceToken),
      catchAll("nexus-community", "private-weights"),
    );
    assert.equal(inferenceRead.status, 403);
    const ownerRead = await detail.GET(
      modelRequest("/nexus-community/private-weights", ownerToken),
      catchAll("nexus-community", "private-weights"),
    );
    assert.equal(ownerRead.status, 200);

    const gated = await catalog.POST(
      modelRequest("", ownerToken, {
        method: "POST",
        body: JSON.stringify({ namespace: "nexus-community", slug: "gated-weights", title: "Gated weights", gated: true }),
      }),
    );
    assert.equal(gated.status, 201);
    const revision = await revisions.POST(
      modelRequest("/nexus-community/gated-weights/revisions", ownerToken, {
        method: "POST",
        body: JSON.stringify({ commit_message: "Controlled release", files: [{ file_id: "file_model_owner", path: "model.bin" }] }),
      }),
      context("nexus-community", "gated-weights"),
    );
    assert.equal(revision.status, 201);

    const locked = await detail.GET(
      modelRequest("/nexus-community/gated-weights"),
      catchAll("nexus-community", "gated-weights"),
    );
    const lockedJson = (await locked.json()) as { data: { access: { content: boolean }; revisions: unknown[] } };
    assert.equal(lockedJson.data.access.content, false);
    assert.deepEqual(lockedJson.data.revisions, []);

    const requested = await access.POST(
      modelRequest("/nexus-community/gated-weights/access", readerToken, { method: "POST" }),
      context("nexus-community", "gated-weights"),
    );
    assert.equal(requested.status, 201);
    const queue = await access.GET(
      modelRequest("/nexus-community/gated-weights/access", ownerToken),
      context("nexus-community", "gated-weights"),
    );
    const queueJson = (await queue.json()) as { data: { grants: Array<{ id: string }> } };
    const approved = await access.PATCH(
      modelRequest("/nexus-community/gated-weights/access", ownerToken, {
        method: "PATCH",
        body: JSON.stringify({ id: queueJson.data.grants[0].id, status: "approved" }),
      }),
      context("nexus-community", "gated-weights"),
    );
    assert.equal(approved.status, 200);

    const download = await resolveFile.GET(
      modelRequest("/nexus-community/gated-weights/resolve/main/model.bin", readerToken),
      { params: Promise.resolve({ namespace: "nexus-community", slug: "gated-weights", revision: "main", path: ["model.bin"] }) },
    );
    assert.equal(download.status, 200);
    assert.equal(download.headers.get("cache-control"), "private, no-store");
  });

  it("verifies revision-bound evaluations before fail-closed runtime promotion", async () => {
    const blockedEvidence = await evaluations.POST(
      modelRequest("/nexus-community/spanish-7b/evaluations", ownerToken, {
        method: "POST",
        body: JSON.stringify({
          revision: 1,
          benchmark: "MMLU-Pro",
          task: "text-generation",
          dataset: "TIGER-Lab/MMLU-Pro",
          metric: "accuracy",
          metric_value: 0.71,
          evaluator: "lm-evaluation-harness",
          evidence_url: "http://127.0.0.1/results.json",
          evidence_sha256: "b".repeat(64),
        }),
      }),
      context("nexus-community", "spanish-7b"),
    );
    assert.equal(blockedEvidence.status, 400);

    const submitted = await evaluations.POST(
      modelRequest("/nexus-community/spanish-7b/evaluations", ownerToken, {
        method: "POST",
        body: JSON.stringify({
          revision: 1,
          benchmark: "MMLU-Pro",
          task: "text-generation",
          dataset: "TIGER-Lab/MMLU-Pro",
          dataset_revision: "2026-08",
          metric: "accuracy",
          metric_value: 0.71,
          sample_count: 12000,
          evaluator: "lm-evaluation-harness",
          evaluator_version: "0.4.9",
          evidence_url: "https://example.com/results.json",
          evidence_sha256: "b".repeat(64),
        }),
      }),
      context("nexus-community", "spanish-7b"),
    );
    assert.equal(submitted.status, 201);
    const submittedJson = (await submitted.json()) as { data: { id: string; status: string } };
    assert.equal(submittedJson.data.status, "submitted");

    const hidden = await evaluations.GET(
      modelRequest("/nexus-community/spanish-7b/evaluations"),
      context("nexus-community", "spanish-7b"),
    );
    const hiddenJson = (await hidden.json()) as { data: unknown[] };
    assert.deepEqual(hiddenJson.data, []);

    const requested = await promotions.POST(
      modelRequest("/nexus-community/spanish-7b/promotions", ownerToken, {
        method: "POST",
        body: JSON.stringify({
          revision: 1,
          runtime_model_id: "meta-llama/llama-3.3-70b-instruct",
        }),
      }),
      context("nexus-community", "spanish-7b"),
    );
    assert.equal(requested.status, 201);
    const requestedJson = (await requested.json()) as { data: { id: string; status: string } };
    assert.equal(requestedJson.data.status, "pending");

    const replayedRequest = await promotions.POST(
      modelRequest("/nexus-community/spanish-7b/promotions", ownerToken, {
        method: "POST",
        body: JSON.stringify({
          revision: 1,
          runtime_model_id: "meta-llama/llama-3.3-70b-instruct",
        }),
      }),
      context("nexus-community", "spanish-7b"),
    );
    const replayedJson = (await replayedRequest.json()) as { data: { id: string } };
    assert.equal(replayedRequest.status, 201);
    assert.equal(replayedJson.data.id, requestedJson.data.id);

    const conflictingRequest = await promotions.POST(
      modelRequest("/nexus-community/spanish-7b/promotions", ownerToken, {
        method: "POST",
        body: JSON.stringify({ revision: 1, runtime_model_id: "openai/gpt-4o" }),
      }),
      context("nexus-community", "spanish-7b"),
    );
    assert.equal(conflictingRequest.status, 409);

    await assert.rejects(
      () =>
        governance.reviewModelPromotion({
          promotionId: requestedJson.data.id,
          actorUserId: "usr_model_admin",
          decision: "approved",
          note: "All evidence reviewed by platform operations.",
        }),
      /verified_evaluation/,
    );

    await governance.reviewModelEvaluation({
      evaluationId: submittedJson.data.id,
      actorUserId: "usr_model_admin",
      decision: "approved",
      note: "Dataset, harness output and checksum reproduced.",
    });
    const approved = await governance.reviewModelPromotion({
      promotionId: requestedJson.data.id,
      actorUserId: "usr_model_admin",
      decision: "approved",
      note: "Runtime pricing, provider policy and artifact checks passed.",
    });
    assert.equal(approved.status, "approved");
    assert.ok(Object.values(approved.checklist).every(Boolean));

    const publicResults = await evaluations.GET(
      modelRequest("/nexus-community/spanish-7b/evaluations"),
      context("nexus-community", "spanish-7b"),
    );
    const publicJson = (await publicResults.json()) as { data: Array<{ status: string; review_note: string | null; revision: number }> };
    assert.equal(publicJson.data[0]?.status, "verified");
    assert.equal(publicJson.data[0]?.revision, 1);
    assert.equal(publicJson.data[0]?.review_note, null);

    const verifiedDetail = await detail.GET(
      modelRequest("/nexus-community/spanish-7b", ownerToken),
      catchAll("nexus-community", "spanish-7b"),
    );
    const verifiedJson = (await verifiedDetail.json()) as {
      data: { nexus: { verification_status: string; runtime_model_id: string; verified_revision: number; current_revision_verified: boolean; promoted: boolean; verified_at: string } };
    };
    assert.equal(verifiedJson.data.nexus.verification_status, "verified");
    assert.equal(verifiedJson.data.nexus.verified_revision, 1);
    assert.equal(verifiedJson.data.nexus.current_revision_verified, true);
    assert.equal(verifiedJson.data.nexus.runtime_model_id, "meta-llama/llama-3.3-70b-instruct");
    assert.equal(verifiedJson.data.nexus.promoted, true);
    assert.match(verifiedJson.data.nexus.verified_at, /^\d{4}-\d{2}-\d{2}T/);

    const revisionTwo = await revisions.POST(
      modelRequest("/nexus-community/spanish-7b/revisions", ownerToken, {
        method: "POST",
        body: JSON.stringify({
          commit_message: "Publish next safe revision",
          files: [{ file_id: "file_model_owner", path: "weights/model.safetensors" }],
        }),
      }),
      context("nexus-community", "spanish-7b"),
    );
    assert.equal(revisionTwo.status, 201);
    const staleDetail = await detail.GET(
      modelRequest("/nexus-community/spanish-7b", ownerToken),
      catchAll("nexus-community", "spanish-7b"),
    );
    const staleJson = (await staleDetail.json()) as { data: { nexus: { verification_status: string; current_revision_verified: boolean } } };
    assert.equal(staleJson.data.nexus.verification_status, "stale");
    assert.equal(staleJson.data.nexus.current_revision_verified, false);
  });
});
