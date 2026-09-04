import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";

const dataDir = mkdtempSync(join(tmpdir(), "nexus-spaces-api-test-"));
process.env.ENABLE_PGLITE = "true";
process.env.PGLITE_DATA_DIR = dataDir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.POSTGRES_PRISMA_URL;

const ownerToken = "sk-nx-mgmt-space-owner";
const readerToken = "sk-nx-mgmt-space-reader";
let database: typeof import("../src/lib/db");
let collection: typeof import("../src/app/api/v1/spaces/route");
let detail: typeof import("../src/app/api/v1/spaces/[namespace]/[slug]/route");
let store: typeof import("../src/lib/hub/space-store");

function request(path: string, token?: string, init?: RequestInit) {
  return new Request(`https://nexus.test/api/v1/spaces${path}`, {
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
  collection = await import("../src/app/api/v1/spaces/route");
  detail = await import("../src/app/api/v1/spaces/[namespace]/[slug]/route");
  store = await import("../src/lib/hub/space-store");
  await database.ensureDb();
  await database.db.insert(database.schema.users).values([
    { id: "usr_space_owner", name: "Space Owner", email: "owner@spaces.test", plan: "pro" },
    { id: "usr_space_reader", name: "Space Reader", email: "reader@spaces.test", plan: "pro" },
  ]);
  await database.db.insert(database.schema.apiKeys).values([
    {
      id: "key_space_owner",
      userId: "usr_space_owner",
      name: "Space owner",
      keyHash: sha256(ownerToken),
      keyPrefix: "sk-nx-mgmt-space-owner",
      isManagement: true,
    },
    {
      id: "key_space_reader",
      userId: "usr_space_reader",
      name: "Space reader",
      keyHash: sha256(readerToken),
      keyPrefix: "sk-nx-mgmt-space-reader",
      isManagement: true,
    },
  ]);
});

after(() => rmSync(dataDir, { recursive: true, force: true }));

describe("tenant-safe Spaces API", () => {
  it("lists only public Spaces and conceals private tenants", async () => {
    for (const input of [
      { slug: "public-copilot", title: "Public Copilot", visibility: "public" },
      { slug: "private-copilot", title: "Private Copilot", visibility: "private" },
    ]) {
      const response = await collection.POST(request("", ownerToken, {
        method: "POST",
        body: JSON.stringify({ namespace: "Nexus Labs", model: "nexus/auto", ...input }),
      }));
      assert.equal(response.status, 201);
    }

    const listed = await collection.GET(request(""));
    const listedJson = (await listed.json()) as { data: Array<{ path: string }> };
    assert.deepEqual(listedJson.data.map((row) => row.path), ["nexus-labs/public-copilot"]);

    const hidden = await detail.GET(
      request("/nexus-labs/private-copilot", readerToken),
      context("nexus-labs", "private-copilot"),
    );
    assert.equal(hidden.status, 404);

    const rejectedModel = await collection.POST(request("", ownerToken, {
      method: "POST",
      body: JSON.stringify({ namespace: "nexus-labs", slug: "fake", title: "Fake", model: "missing/model" }),
    }));
    assert.equal(rejectedModel.status, 400);
  });

  it("attributes run records to the runner and keeps generation accounting intact", async () => {
    const space = await store.findHubSpace("nexus-labs", "public-copilot");
    assert.ok(space);
    await database.db.insert(database.schema.generations).values({
      id: "gen_space_reader",
      userId: "usr_space_reader",
      requestedModel: "nexus/auto",
      routedModel: "openai/gpt-4o",
      provider: "openai",
    });
    await store.recordHubSpaceRun(
      {
        userId: "usr_space_reader",
        billingUserId: "usr_space_reader",
        workspaceIds: [],
        isManagement: false,
        scopes: ["inference:write"],
        creditMicros: 1_000_000,
        zdr: false,
        allowTraining: true,
        logPrompts: false,
      },
      space,
      "gen_space_reader",
    );
    const [run] = await database.db
      .select()
      .from(database.schema.hubSpaceRuns)
      .where(eq(database.schema.hubSpaceRuns.generationId, "gen_space_reader"));
    const refreshed = await store.findHubSpace("nexus-labs", "public-copilot");
    assert.equal(run?.userId, "usr_space_reader");
    assert.equal(run?.spaceId, space.id);
    assert.equal(refreshed?.runs, 1);
  });
});
