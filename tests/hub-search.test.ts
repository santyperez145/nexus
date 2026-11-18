import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";

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

  await database.db.insert(database.schema.workspaces).values({
    id: "ws_search_other",
    userId: "usr_search_other",
    name: "Former workspace",
    slug: "former-workspace",
  });

  for (const dataset of [
    { slug: "atlas-public", title: "Atlas public corpus", visibility: "public" },
    { slug: "atlas-private", title: "Atlas private corpus", visibility: "private" },
    { slug: "revoked-corpus", title: "Revoked corpus", visibility: "private" },
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
  // Existing resource created by an account that no longer belongs to this workspace.
  await database.db.update(database.schema.hubRepositories)
    .set({ workspaceId: "ws_search_other" })
    .where(eq(database.schema.hubRepositories.slug, "revoked-corpus"));

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

  const { POST: publishModel } = await import("../src/app/api/v1/models/route");
  const { POST: publishCollection } = await import("../src/app/api/v1/collections/route");
  const createRequest = (type: "models" | "collections", slug: string, visibility: string) => new Request(
    `https://nexus.test/api/v1/${type}`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${ownerToken}`, "content-type": "application/json" },
      body: JSON.stringify({ namespace: "Atlas Labs", slug, title: slug, visibility }),
    },
  );
  assert.equal((await publishModel(createRequest("models", "atlas-private-model", "private"))).status, 201);
  assert.equal((await publishCollection(createRequest("collections", "atlas-collection", "public"))).status, 201);
  for (const slug of ["exact-ranking", "exact-ranking-new-a", "exact-ranking-new-b"]) {
    assert.equal((await publishCollection(createRequest("collections", slug, "public"))).status, 201);
  }
  await database.db.update(database.schema.hubCollections)
    .set({ updatedAt: new Date("2024-01-01T00:00:00Z") })
    .where(eq(database.schema.hubCollections.slug, "exact-ranking"));
});

after(async () => {
  await database?.closeDbForTests();
  rmSync(dataDir, { recursive: true, force: true });
});

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
    const model = rows.find((row) => row.type === "model" && row.path === "atlas-labs/atlas-private-model");
    assert.equal(model?.href, "/settings/models/atlas-labs/atlas-private-model");
    assert.ok(paths(rows, "collection").includes("atlas-labs/atlas-collection"));
  });

  it("never leaks another tenant's private rows", async () => {
    const rows = await hits("q=atlas-labs%2Fatlas", otherToken);
    assert.deepEqual(paths(rows, "dataset"), ["atlas-labs/atlas-public"]);
    assert.equal(paths(rows, "space").length, 0);
    assert.deepEqual(paths(rows, "model"), []);
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

  it("uses current workspace membership rather than the original creator", async () => {
    assert.deepEqual(paths(await hits("q=revoked", ownerToken), "dataset"), []);
    assert.deepEqual(paths(await hits("q=revoked", otherToken), "dataset"), ["atlas-labs/revoked-corpus"]);
    const listing = await datasets.GET(new Request("https://nexus.test/api/v1/datasets?mine=1&q=revoked", {
      headers: { authorization: `Bearer ${ownerToken}` },
    }));
    assert.equal(listing.status, 200);
    assert.deepEqual((await listing.json()).data, []);
  });

  it("matches a qualified path literally and treats wildcards as text", async () => {
    assert.deepEqual(paths(await hits("q=atlas-labs%2Fatlas-public&type=dataset"), "dataset"), ["atlas-labs/atlas-public"]);
    assert.deepEqual(paths(await hits("q=%25%25&type=dataset", ownerToken), "dataset"), []);
  });

  it("ranks older exact names before newer prefixes at the source limit", async () => {
    const rows = await hits("q=exact-ranking&type=collection&limit=1");
    assert.deepEqual(paths(rows, "collection"), ["atlas-labs/exact-ranking"]);
  });

  it("bounds the entire result set and prevents shared caching", async () => {
    const response = await search.GET(searchRequest("q=openai&limit=1"));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    const body = await response.json();
    assert.equal(body.data.length, 1);
    assert.equal(body.meta.count, 1);
    assert.equal(body.meta.truncated, true);
  });

  it("does not downgrade an invalid credential into public access", async () => {
    const response = await search.GET(searchRequest("q=atlas", "invalid-search-key"));
    assert.equal(response.status, 401);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  });
});
