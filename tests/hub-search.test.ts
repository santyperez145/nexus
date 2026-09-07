import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "nexus-hub-search-test-"));
process.env.ENABLE_PGLITE = "true";
process.env.PGLITE_DATA_DIR = dataDir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.POSTGRES_PRISMA_URL;

const ownerToken = "sk-nx-mgmt-search-owner";
const otherToken = "sk-nx-mgmt-search-other";
const scopedToken = "sk-nx-mgmt-search-scoped";
const inferenceToken = "sk-nx-search-inference";

let database: typeof import("../src/lib/db");
let search: typeof import("../src/app/api/v1/search/route");
let datasets: typeof import("../src/app/api/v1/datasets/route");
let spaces: typeof import("../src/app/api/v1/spaces/route");

type Hit = {
  type: string;
  path: string;
  scope: "public" | "tenant";
  title: string;
  href: string;
};

function searchRequest(query: string, token?: string) {
  return new Request(`https://nexus.test/api/v1/search?${query}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

async function hits(query: string, token?: string) {
  const response = await search.GET(searchRequest(query, token));
  assert.equal(response.status, 200);
  const payload = (await response.json()) as { data: Hit[] };
  return payload.data;
}

function paths(rows: Hit[], type: string) {
  return rows.filter((row) => row.type === type).map((row) => row.path);
}

before(async () => {
  database = await import("../src/lib/db");
  const { sha256 } = await import("../src/lib/crypto");
  search = await import("../src/app/api/v1/search/route");
  datasets = await import("../src/app/api/v1/datasets/route");
  spaces = await import("../src/app/api/v1/spaces/route");
  await database.ensureDb();
  await database.db.insert(database.schema.users).values([
    { id: "usr_search_owner", name: "Search Owner", email: "owner@search.test", plan: "team" },
    { id: "usr_search_other", name: "Search Other", email: "other@search.test", plan: "team" },
  ]);
  await database.db.insert(database.schema.apiKeys).values([
    {
      id: "key_search_owner",
      userId: "usr_search_owner",
      name: "Search owner",
      keyHash: sha256(ownerToken),
      keyPrefix: ownerToken,
      isManagement: true,
    },
    {
      id: "key_search_other",
      userId: "usr_search_other",
      name: "Search other",
      keyHash: sha256(otherToken),
      keyPrefix: otherToken,
      isManagement: true,
    },
    {
      id: "key_search_scoped",
      userId: "usr_search_owner",
      name: "Search scoped",
      keyHash: sha256(scopedToken),
      keyPrefix: scopedToken,
      isManagement: true,
      scopes: ["spaces:read"],
    },
    {
      id: "key_search_inference",
      userId: "usr_search_owner",
      name: "Search inference",
      keyHash: sha256(inferenceToken),
      keyPrefix: inferenceToken,
      isManagement: false,
    },
  ]);

  for (const dataset of [
    { slug: "atlas-public", title: "Atlas public corpus", visibility: "public" },
    { slug: "atlas-private", title: "Atlas private corpus", visibility: "private" },
  ]) {
    const response = await datasets.POST(
      new Request("https://nexus.test/api/v1/datasets", {
        method: "POST",
        headers: { authorization: `Bearer ${ownerToken}`, "content-type": "application/json" },
        body: JSON.stringify({ namespace: "Atlas Labs", ...dataset }),
      }),
    );
    assert.equal(response.status, 201);
  }

  const space = await spaces.POST(
    new Request("https://nexus.test/api/v1/spaces", {
      method: "POST",
      headers: { authorization: `Bearer ${ownerToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        namespace: "Atlas Labs",
        slug: "atlas-private-space",
        title: "Atlas private space",
        visibility: "private",
      }),
    }),
  );
  assert.equal(space.status, 201);
});

after(() => rmSync(dataDir, { recursive: true, force: true }));

describe("unified hub search", () => {
  it("returns only public rows to anonymous callers", async () => {
    const rows = await hits("q=atlas");
    assert.deepEqual(paths(rows, "dataset"), ["atlas-labs/atlas-public"]);
    assert.equal(paths(rows, "space").length, 0);
    assert.ok(rows.every((row) => row.scope === "public"));
  });

  it("adds tenant rows for the owning management key", async () => {
    const rows = await hits("q=atlas", ownerToken);
    const datasetPaths = paths(rows, "dataset");
    assert.ok(datasetPaths.includes("atlas-labs/atlas-public"));
    assert.ok(datasetPaths.includes("atlas-labs/atlas-private"));
    assert.deepEqual(paths(rows, "space"), ["atlas-labs/atlas-private-space"]);
  });

  it("never leaks another tenant's private rows", async () => {
    const rows = await hits("q=atlas", otherToken);
    assert.deepEqual(paths(rows, "dataset"), ["atlas-labs/atlas-public"]);
    assert.equal(paths(rows, "space").length, 0);
  });

  it("limits private rows to the scopes granted to the key", async () => {
    const rows = await hits("q=atlas", scopedToken);
    assert.deepEqual(paths(rows, "dataset"), ["atlas-labs/atlas-public"]);
    assert.deepEqual(paths(rows, "space"), ["atlas-labs/atlas-private-space"]);
  });

  it("keeps inference keys on the public index", async () => {
    const rows = await hits("q=atlas", inferenceToken);
    assert.deepEqual(paths(rows, "dataset"), ["atlas-labs/atlas-public"]);
    assert.equal(paths(rows, "space").length, 0);
  });

  it("searches the executable catalog and connected providers", async () => {
    const rows = await hits("q=openai&limit=10");
    assert.ok(rows.some((row) => row.type === "provider" && row.path === "openai"));
    assert.ok(rows.some((row) => row.type === "model" && row.href.startsWith("/models/")));
  });

  it("filters by type and rejects unknown types", async () => {
    const rows = await hits("q=atlas&type=dataset");
    assert.ok(rows.length > 0);
    assert.ok(rows.every((row) => row.type === "dataset"));
    const response = await search.GET(searchRequest("q=atlas&type=secrets"));
    assert.equal(response.status, 400);
  });
});
