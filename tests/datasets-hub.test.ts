import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "nexus-datasets-hub-test-"));
process.env.ENABLE_PGLITE = "true";
process.env.PGLITE_DATA_DIR = dataDir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.POSTGRES_PRISMA_URL;

const ownerToken = "sk-nx-mgmt-dataset-owner";
const readerToken = "sk-nx-mgmt-dataset-reader";
let database: typeof import("../src/lib/db");
let collection: typeof import("../src/app/api/v1/datasets/route");
let detail: typeof import("../src/app/api/v1/datasets/[namespace]/[slug]/route");
let revisions: typeof import("../src/app/api/v1/datasets/[namespace]/[slug]/revisions/route");
let access: typeof import("../src/app/api/v1/datasets/[namespace]/[slug]/access/route");
let resolveFile: typeof import("../src/app/api/v1/datasets/[namespace]/[slug]/resolve/[revision]/[...path]/route");
let files: typeof import("../src/app/api/v1/files/route");

function request(path: string, token?: string, init?: RequestInit) {
  return new Request(`https://nexus.test/api/v1/datasets${path}`, {
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

before(async () => {
  database = await import("../src/lib/db");
  const { sha256 } = await import("../src/lib/crypto");
  collection = await import("../src/app/api/v1/datasets/route");
  detail = await import("../src/app/api/v1/datasets/[namespace]/[slug]/route");
  revisions = await import("../src/app/api/v1/datasets/[namespace]/[slug]/revisions/route");
  access = await import("../src/app/api/v1/datasets/[namespace]/[slug]/access/route");
  resolveFile = await import(
    "../src/app/api/v1/datasets/[namespace]/[slug]/resolve/[revision]/[...path]/route"
  );
  files = await import("../src/app/api/v1/files/route");
  await database.ensureDb();
  await database.db.insert(database.schema.users).values([
    { id: "usr_hub_owner", name: "Hub Owner", email: "owner@hub.test", plan: "pro" },
    { id: "usr_hub_reader", name: "Hub Reader", email: "reader@hub.test", plan: "pro" },
  ]);
  await database.db.insert(database.schema.apiKeys).values([
    {
      id: "key_hub_owner",
      userId: "usr_hub_owner",
      name: "Hub owner",
      keyHash: sha256(ownerToken),
      keyPrefix: "sk-nx-mgmt-dataset-owner",
      isManagement: true,
    },
    {
      id: "key_hub_reader",
      userId: "usr_hub_reader",
      name: "Hub reader",
      keyHash: sha256(readerToken),
      keyPrefix: "sk-nx-mgmt-dataset-reader",
      isManagement: true,
    },
  ]);
  await database.db.insert(database.schema.files).values([
    {
      id: "file_hub_owner",
      userId: "usr_hub_owner",
      filename: "train.jsonl",
      mime: "application/jsonl",
      size: 12,
      content: Buffer.from('{"text":1}\n').toString("base64"),
    },
    {
      id: "file_hub_reader",
      userId: "usr_hub_reader",
      filename: "foreign.jsonl",
      mime: "application/jsonl",
      size: 14,
      content: Buffer.from('{"foreign":1}\n').toString("base64"),
    },
  ]);
});

after(() => rmSync(dataDir, { recursive: true, force: true }));

describe("versioned dataset Hub", () => {
  it("keeps private repositories out of anonymous listings and foreign tenants", async () => {
    const publicResponse = await collection.POST(
      request("", ownerToken, {
        method: "POST",
        body: JSON.stringify({
          namespace: "Nexus Labs",
          slug: "support-evals",
          title: "Support evals",
          task: "text-classification",
          tags: ["spanish", "evals"],
        }),
      }),
    );
    assert.equal(publicResponse.status, 201);

    const privateResponse = await collection.POST(
      request("", ownerToken, {
        method: "POST",
        body: JSON.stringify({
          namespace: "nexus-labs",
          slug: "private-corpus",
          title: "Private corpus",
          visibility: "private",
        }),
      }),
    );
    assert.equal(privateResponse.status, 201);

    const publicList = await collection.GET(request(""));
    const publicJson = (await publicList.json()) as { data: Array<{ path: string }> };
    assert.deepEqual(publicJson.data.map((row) => row.path), ["nexus-labs/support-evals"]);

    const mine = await collection.GET(request("?mine=1", ownerToken));
    const mineJson = (await mine.json()) as { data: Array<{ path: string }> };
    assert.equal(mineJson.data.length, 2);

    const hidden = await detail.GET(
      request("/nexus-labs/private-corpus", readerToken),
      context("nexus-labs", "private-corpus"),
    );
    assert.equal(hidden.status, 404);
  });

  it("publishes immutable snapshots and serves a public revision", async () => {
    const foreign = await revisions.POST(
      request("/nexus-labs/support-evals/revisions", ownerToken, {
        method: "POST",
        body: JSON.stringify({
          commit_message: "try foreign file",
          files: [{ file_id: "file_hub_reader", path: "data/train.jsonl" }],
        }),
      }),
      context("nexus-labs", "support-evals"),
    );
    assert.equal(foreign.status, 404);

    const created = await revisions.POST(
      request("/nexus-labs/support-evals/revisions", ownerToken, {
        method: "POST",
        body: JSON.stringify({
          commit_message: "Initial training split",
          metadata: { rows: 1, format: "jsonl" },
          files: [{ file_id: "file_hub_owner", path: "data/train.jsonl" }],
        }),
      }),
      context("nexus-labs", "support-evals"),
    );
    assert.equal(created.status, 201);
    const createdJson = (await created.json()) as { data: { revision: number; commit_sha: string } };
    assert.equal(createdJson.data.revision, 1);
    assert.match(createdJson.data.commit_sha, /^[a-f0-9]{16}$/);

    const downloaded = await resolveFile.GET(
      request("/nexus-labs/support-evals/resolve/1/data/train.jsonl"),
      {
        params: Promise.resolve({
          namespace: "nexus-labs",
          slug: "support-evals",
          revision: "1",
          path: ["data", "train.jsonl"],
        }),
      },
    );
    assert.equal(downloaded.status, 200);
    assert.equal(await downloaded.text(), '{"text":1}\n');
    assert.equal(downloaded.headers.get("cache-control"), "public, max-age=31536000, immutable");

    const deleteReferenced = await files.DELETE(
      new Request("https://nexus.test/api/v1/files?id=file_hub_owner", {
        method: "DELETE",
        headers: { authorization: `Bearer ${ownerToken}` },
      }),
    );
    assert.equal(deleteReferenced.status, 409);
  });

  it("keeps gated bytes closed until an owner approves access", async () => {
    const gated = await collection.POST(
      request("", ownerToken, {
        method: "POST",
        body: JSON.stringify({
          namespace: "nexus-labs",
          slug: "safety-red-team",
          title: "Safety red team",
          gated: true,
        }),
      }),
    );
    assert.equal(gated.status, 201);
    const revision = await revisions.POST(
      request("/nexus-labs/safety-red-team/revisions", ownerToken, {
        method: "POST",
        body: JSON.stringify({
          commit_message: "Controlled release",
          files: [{ file_id: "file_hub_owner", path: "red-team.jsonl" }],
        }),
      }),
      context("nexus-labs", "safety-red-team"),
    );
    assert.equal(revision.status, 201);

    const locked = await detail.GET(
      request("/nexus-labs/safety-red-team"),
      context("nexus-labs", "safety-red-team"),
    );
    const lockedJson = (await locked.json()) as {
      data: { access: { content: boolean }; revisions: unknown[] };
    };
    assert.equal(lockedJson.data.access.content, false);
    assert.deepEqual(lockedJson.data.revisions, []);

    const requested = await access.POST(
      request("/nexus-labs/safety-red-team/access", readerToken, { method: "POST" }),
      context("nexus-labs", "safety-red-team"),
    );
    assert.equal(requested.status, 201);

    const ownerList = await access.GET(
      request("/nexus-labs/safety-red-team/access", ownerToken),
      context("nexus-labs", "safety-red-team"),
    );
    const ownerJson = (await ownerList.json()) as {
      data: { grants: Array<{ id: string; email: string }> };
    };
    assert.equal(ownerJson.data.grants[0]?.email, "reader@hub.test");

    const approved = await access.PATCH(
      request("/nexus-labs/safety-red-team/access", ownerToken, {
        method: "PATCH",
        body: JSON.stringify({ id: ownerJson.data.grants[0].id, status: "approved" }),
      }),
      context("nexus-labs", "safety-red-team"),
    );
    assert.equal(approved.status, 200);

    const download = await resolveFile.GET(
      request("/nexus-labs/safety-red-team/resolve/main/red-team.jsonl", readerToken),
      {
        params: Promise.resolve({
          namespace: "nexus-labs",
          slug: "safety-red-team",
          revision: "main",
          path: ["red-team.jsonl"],
        }),
      },
    );
    assert.equal(download.status, 200);
    assert.equal(download.headers.get("cache-control"), "private, no-store");
  });
});
