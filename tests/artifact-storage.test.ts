import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "nexus-artifact-storage-test-"));
process.env.ENABLE_PGLITE = "true";
process.env.PGLITE_DATA_DIR = dataDir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.POSTGRES_PRISMA_URL;
delete process.env.NEXUS_OBJECT_STORAGE_BUCKET;

const paidToken = "sk-nx-mgmt-artifact-paid";
const zeroToken = "sk-nx-mgmt-artifact-zero";
let database: typeof import("../src/lib/db");
let files: typeof import("../src/app/api/v1/files/route");
let content: typeof import("../src/app/api/v1/files/[id]/content/route");
let uploads: typeof import("../src/app/api/v1/files/uploads/route");
let complete: typeof import("../src/app/api/v1/files/uploads/[id]/complete/route");

function request(path: string, token: string, init?: RequestInit) {
  return new Request(`https://nexus.test/api/v1/files${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...init?.headers },
  });
}

before(async () => {
  database = await import("../src/lib/db");
  const { sha256 } = await import("../src/lib/crypto");
  files = await import("../src/app/api/v1/files/route");
  content = await import("../src/app/api/v1/files/[id]/content/route");
  uploads = await import("../src/app/api/v1/files/uploads/route");
  complete = await import("../src/app/api/v1/files/uploads/[id]/complete/route");
  await database.ensureDb();
  await database.db.insert(database.schema.users).values([
    { id: "usr_artifact_paid", name: "Artifact Paid", email: "artifact-paid@nexus.test", plan: "pro" },
    { id: "usr_artifact_zero", name: "Artifact Zero", email: "artifact-zero@nexus.test", plan: "guest" },
  ]);
  await database.db.insert(database.schema.apiKeys).values([
    {
      id: "key_artifact_paid",
      userId: "usr_artifact_paid",
      name: "Artifact paid",
      keyHash: sha256(paidToken),
      keyPrefix: paidToken,
      isManagement: true,
      scopes: ["files:read", "files:write"],
    },
    {
      id: "key_artifact_zero",
      userId: "usr_artifact_zero",
      name: "Artifact zero",
      keyHash: sha256(zeroToken),
      keyPrefix: zeroToken,
      isManagement: true,
      scopes: ["files:read", "files:write"],
    },
  ]);
  await database.db.insert(database.schema.workspaces).values({
    id: "ws_artifact_paid",
    userId: "usr_artifact_paid",
    name: "Artifact workspace",
    slug: "artifact-workspace",
  });
  await database.db.insert(database.schema.files).values({
    id: "file_workspace_pending",
    userId: "usr_artifact_paid",
    workspaceId: "ws_artifact_paid",
    filename: "private.safetensors",
    mime: "application/octet-stream",
    size: 512,
    storageBackend: "s3",
    storageKey: "nexus-artifacts/workspaces/ws_artifact_paid/file_workspace_pending",
    checksumSha256: "c".repeat(64),
    status: "pending",
    uploadExpiresAt: new Date(Date.now() + 60_000),
  });
});

after(() => rmSync(dataDir, { recursive: true, force: true }));

describe("artifact storage control plane", () => {
  it("stores small files with a digest and serves them through the protected content route", async () => {
    const form = new FormData();
    form.append("file", new File(["artifact"], "weights.gguf", { type: "application/octet-stream" }));
    const uploaded = await files.POST(request("", paidToken, { method: "POST", body: form }));
    assert.equal(uploaded.status, 201);
    const body = (await uploaded.json()) as {
      data: { id: string; status: string; storage_backend: string; sha256: string };
    };
    assert.equal(body.data.status, "ready");
    assert.equal(body.data.storage_backend, "database");
    assert.match(body.data.sha256, /^[a-f0-9]{64}$/);

    const downloaded = await content.GET(request(`/${body.data.id}/content`, paidToken), {
      params: Promise.resolve({ id: body.data.id }),
    });
    assert.equal(downloaded.status, 200);
    assert.equal(await downloaded.text(), "artifact");
    assert.match(downloaded.headers.get("etag") ?? "", /sha256/);
  });

  it("fails closed when direct object storage is unavailable", async () => {
    const response = await uploads.POST(
      request("/uploads", paidToken, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: "large.safetensors",
          mime: "application/octet-stream",
          bytes: 9_000_000,
          sha256: "b".repeat(64),
        }),
      }),
    );
    assert.equal(response.status, 503);
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, "object_storage_unavailable");
  });

  it("enforces the plan storage quota inside the reservation transaction", async () => {
    const form = new FormData();
    form.append("file", new File(["x"], "blocked.txt", { type: "text/plain" }));
    const response = await files.POST(request("", zeroToken, { method: "POST", body: form }));
    assert.equal(response.status, 413);
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, "storage_quota_exceeded");
  });

  it("conceals workspace upload reservations from another tenant", async () => {
    const response = await complete.POST(
      request("/uploads/file_workspace_pending/complete", zeroToken, { method: "POST" }),
      { params: Promise.resolve({ id: "file_workspace_pending" }) },
    );
    assert.equal(response.status, 404);
  });

  it("keeps personal and workspace artifact listings in exact scopes", async () => {
    const personal = await files.GET(request("", paidToken));
    const personalBody = (await personal.json()) as { data: Array<{ id: string }> };
    assert.equal(personalBody.data.some((file) => file.id === "file_workspace_pending"), false);

    const workspace = await files.GET(request("?workspace_id=ws_artifact_paid", paidToken));
    const workspaceBody = (await workspace.json()) as {
      data: Array<{ id: string }>;
      meta: { storage: { workspace_id: string } };
    };
    assert.equal(workspace.status, 200);
    assert.equal(workspaceBody.data.some((file) => file.id === "file_workspace_pending"), true);
    assert.equal(workspaceBody.meta.storage.workspace_id, "ws_artifact_paid");
  });

  it("validates portable object storage configuration", async () => {
    const { objectStorageConfig } = await import("../src/lib/files/blob-store");
    const config = objectStorageConfig({
      NODE_ENV: "production",
      NEXUS_OBJECT_STORAGE_BUCKET: "nexus-artifacts",
      NEXUS_OBJECT_STORAGE_ENDPOINT: "https://storage.example.com",
      NEXUS_OBJECT_STORAGE_REGION: "auto",
      NEXUS_OBJECT_STORAGE_FORCE_PATH_STYLE: "true",
      AWS_ACCESS_KEY_ID: "key",
      AWS_SECRET_ACCESS_KEY: "secret",
    });
    assert.equal(config?.bucket, "nexus-artifacts");
    assert.equal(config?.forcePathStyle, true);
    assert.throws(
      () =>
        objectStorageConfig({
          NODE_ENV: "production",
          NEXUS_OBJECT_STORAGE_BUCKET: "nexus-artifacts",
          NEXUS_OBJECT_STORAGE_ENDPOINT: "http://storage.example.com",
        }),
      /HTTPS/,
    );
  });
});
