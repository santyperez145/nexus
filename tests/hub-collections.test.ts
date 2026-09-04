import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";

const dataDir = mkdtempSync(join(tmpdir(), "nexus-hub-collections-test-"));
process.env.ENABLE_PGLITE = "true";
process.env.PGLITE_DATA_DIR = dataDir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.POSTGRES_PRISMA_URL;

const ownerToken = "sk-nx-mgmt-collection-owner";
const readerToken = "sk-nx-mgmt-collection-reader";
let database: typeof import("../src/lib/db");
let collections: typeof import("../src/app/api/v1/collections/route");
let detail: typeof import("../src/app/api/v1/collections/[namespace]/[slug]/route");
let items: typeof import("../src/app/api/v1/collections/[namespace]/[slug]/items/route");
let datasets: typeof import("../src/app/api/v1/datasets/route");

function request(path: string, token?: string, init?: RequestInit) {
  return new Request(`https://nexus.test/api/v1/collections${path}`, {
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

async function createCollection(input: Record<string, unknown>, token = ownerToken) {
  return collections.POST(
    request("", token, { method: "POST", body: JSON.stringify(input) }),
  );
}

async function mutateItems(
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  token = ownerToken,
) {
  const handler = items[method];
  return handler(
    request(`/nexus-labs/frontier${path}`, token, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    context("nexus-labs", "frontier"),
  );
}

before(async () => {
  database = await import("../src/lib/db");
  const { sha256 } = await import("../src/lib/crypto");
  collections = await import("../src/app/api/v1/collections/route");
  detail = await import("../src/app/api/v1/collections/[namespace]/[slug]/route");
  items = await import("../src/app/api/v1/collections/[namespace]/[slug]/items/route");
  datasets = await import("../src/app/api/v1/datasets/route");
  await database.ensureDb();
  await database.db.insert(database.schema.users).values([
    { id: "usr_collection_owner", name: "Collection Owner", email: "owner@collections.test", plan: "team" },
    { id: "usr_collection_reader", name: "Collection Reader", email: "reader@collections.test", plan: "team" },
  ]);
  await database.db.insert(database.schema.apiKeys).values([
    {
      id: "key_collection_owner",
      userId: "usr_collection_owner",
      name: "Collection owner",
      keyHash: sha256(ownerToken),
      keyPrefix: ownerToken,
      isManagement: true,
    },
    {
      id: "key_collection_reader",
      userId: "usr_collection_reader",
      name: "Collection reader",
      keyHash: sha256(readerToken),
      keyPrefix: readerToken,
      isManagement: true,
    },
  ]);
  await database.db.insert(database.schema.organizations).values({
    id: "org_collections",
    name: "Collections Org",
    slug: "collections-org",
    ownerId: "usr_collection_owner",
  });
  await database.db.insert(database.schema.organizationMembers).values([
    {
      id: "orgmem_collection_owner",
      organizationId: "org_collections",
      userId: "usr_collection_owner",
      role: "owner",
    },
    {
      id: "orgmem_collection_reader",
      organizationId: "org_collections",
      userId: "usr_collection_reader",
      role: "member",
    },
  ]);
  await database.db.insert(database.schema.workspaces).values({
    id: "ws_collections_shared",
    userId: "usr_collection_owner",
    organizationId: "org_collections",
    name: "Shared Collections",
    slug: "shared-collections",
    isDefault: true,
  });
  await database.db.insert(database.schema.workspaceMembers).values({
    id: "wsm_collection_reader",
    workspaceId: "ws_collections_shared",
    userId: "usr_collection_reader",
  });

  for (const resource of [
    { slug: "public-evals", title: "Public evals", visibility: "public" },
    { slug: "private-evals", title: "Private evals", visibility: "private" },
  ]) {
    const response = await datasets.POST(
      new Request("https://nexus.test/api/v1/datasets", {
        method: "POST",
        headers: { authorization: `Bearer ${ownerToken}`, "content-type": "application/json" },
        body: JSON.stringify({ namespace: "Nexus Labs", ...resource }),
      }),
    );
    assert.equal(response.status, 201);
  }
});

after(() => rmSync(dataDir, { recursive: true, force: true }));

describe("tenant-safe Hub collections", () => {
  it("validates paths and collection mutation payloads", async () => {
    const schemas = await import("../src/lib/hub/collections");
    assert.equal(schemas.normalizeCollectionItemPath("nexus/model"), "nexus/model");
    assert.throws(() => schemas.normalizeCollectionItemPath("https://example.test/model"));
    assert.throws(() => schemas.normalizeCollectionItemPath("nexus/model?token=secret"));
    assert.equal(schemas.updateCollectionSchema.safeParse({}).success, false);
    assert.equal(schemas.reorderCollectionItemsSchema.safeParse({ item_ids: Array(101).fill("x") }).success, false);
  });

  it("creates public and private collections without leaking the private tenant", async () => {
    const created = await createCollection({
      namespace: "Nexus Labs",
      slug: "Frontier",
      title: "Frontier stack",
      description: "Curated multi-provider production resources.",
      theme: "cyan",
    });
    assert.equal(created.status, 201);

    const hidden = await createCollection({
      namespace: "Nexus Labs",
      slug: "Private roadmap",
      title: "Private roadmap",
      visibility: "private",
    });
    assert.equal(hidden.status, 201);

    const publicList = await collections.GET(request(""));
    const publicJson = (await publicList.json()) as { data: Array<{ path: string }> };
    assert.deepEqual(publicJson.data.map((row) => row.path), ["nexus-labs/frontier"]);

    const foreignPrivate = await detail.GET(
      request("/nexus-labs/private-roadmap", readerToken),
      context("nexus-labs", "private-roadmap"),
    );
    assert.equal(foreignPrivate.status, 404);

    const ownerPrivate = await detail.GET(
      request("/nexus-labs/private-roadmap", ownerToken),
      context("nexus-labs", "private-roadmap"),
    );
    assert.equal(ownerPrivate.status, 200);
  });

  it("adds heterogeneous resources and filters inaccessible children", async () => {
    for (const input of [
      { type: "model", path: "nexus/auto", note: "Route across eligible providers." },
      { type: "dataset", path: "nexus-labs/public-evals", note: "Public benchmark." },
      { type: "dataset", path: "nexus-labs/private-evals", note: "Internal benchmark." },
    ]) {
      const response = await mutateItems("POST", "/items", input);
      assert.equal(response.status, 200);
    }

    const duplicate = await mutateItems("POST", "/items", {
      type: "model",
      path: "nexus/auto",
    });
    assert.equal(duplicate.status, 409);

    const missing = await mutateItems("POST", "/items", {
      type: "dataset",
      path: "foreign/missing",
    });
    assert.equal(missing.status, 404);

    const anonymous = await detail.GET(
      request("/nexus-labs/frontier"),
      context("nexus-labs", "frontier"),
    );
    const anonymousJson = (await anonymous.json()) as {
      data: { item_count: number; items: Array<{ path: string }> };
    };
    assert.equal(anonymous.status, 200);
    assert.equal(anonymousJson.data.item_count, 2);
    assert.deepEqual(
      anonymousJson.data.items.map((item) => item.path),
      ["nexus/auto", "nexus-labs/public-evals"],
    );

    const owner = await detail.GET(
      request("/nexus-labs/frontier", ownerToken),
      context("nexus-labs", "frontier"),
    );
    const ownerJson = (await owner.json()) as { data: { item_count: number } };
    assert.equal(ownerJson.data.item_count, 3);

    const noLeak = await collections.GET(request("?item=nexus-labs/private-evals"));
    const noLeakJson = (await noLeak.json()) as { data: unknown[] };
    assert.deepEqual(noLeakJson.data, []);
  });

  it("updates notes, atomically reorders the full set and compacts after removal", async () => {
    const response = await detail.GET(
      request("/nexus-labs/frontier", ownerToken),
      context("nexus-labs", "frontier"),
    );
    const body = (await response.json()) as {
      data: { items: Array<{ id: string; path: string; note: string; position: number }> };
    };
    const itemIds = body.data.items.map((item) => item.id);
    assert.equal(itemIds.length, 3);

    const updated = await mutateItems("PATCH", "/items", {
      id: itemIds[0],
      note: "Automatic model routing across providers.",
    });
    assert.equal(updated.status, 200);

    const incomplete = await mutateItems("PUT", "/items", { item_ids: itemIds.slice(0, 2) });
    assert.equal(incomplete.status, 400);
    const duplicate = await mutateItems("PUT", "/items", {
      item_ids: [itemIds[0], itemIds[0], itemIds[2]],
    });
    assert.equal(duplicate.status, 400);

    const reordered = await mutateItems("PUT", "/items", { item_ids: [...itemIds].reverse() });
    const reorderedJson = (await reordered.json()) as {
      data: { items: Array<{ id: string; note: string; position: number }> };
    };
    assert.equal(reordered.status, 200);
    assert.deepEqual(reorderedJson.data.items.map((item) => item.id), [...itemIds].reverse());
    assert.equal(reorderedJson.data.items.find((item) => item.id === itemIds[0])?.note, "Automatic model routing across providers.");

    const removed = await mutateItems("DELETE", `/items?id=${encodeURIComponent(itemIds[1])}`);
    const removedJson = (await removed.json()) as {
      data: { items: Array<{ id: string; position: number }> };
    };
    assert.equal(removed.status, 200);
    assert.deepEqual(removedJson.data.items.map((item) => item.position), [0, 1]);
  });

  it("requires a workspace manager even when a member can read the tenant", async () => {
    const created = await createCollection({
      namespace: "Collections Org",
      slug: "shared-stack",
      title: "Shared stack",
      workspace_id: "ws_collections_shared",
      visibility: "private",
    });
    assert.equal(created.status, 201);

    const memberRead = await detail.GET(
      request("/collections-org/shared-stack", readerToken),
      context("collections-org", "shared-stack"),
    );
    assert.equal(memberRead.status, 200);

    const memberEdit = await detail.PATCH(
      request("/collections-org/shared-stack", readerToken, {
        method: "PATCH",
        body: JSON.stringify({ title: "Unauthorized change" }),
      }),
      context("collections-org", "shared-stack"),
    );
    assert.equal(memberEdit.status, 403);

    const memberCreate = await createCollection(
      {
        namespace: "Collections Org",
        slug: "member-created",
        title: "Member created",
        workspace_id: "ws_collections_shared",
      },
      readerToken,
    );
    assert.equal(memberCreate.status, 403);
  });

  it("cascades collection items on deletion", async () => {
    const collection = await database.db
      .select({ id: database.schema.hubCollections.id })
      .from(database.schema.hubCollections)
      .where(eq(database.schema.hubCollections.slug, "frontier"));
    assert.equal(collection.length, 1);
    const deleted = await detail.DELETE(
      request("/nexus-labs/frontier", ownerToken, { method: "DELETE" }),
      context("nexus-labs", "frontier"),
    );
    assert.equal(deleted.status, 200);
    const children = await database.db
      .select()
      .from(database.schema.hubCollectionItems)
      .where(eq(database.schema.hubCollectionItems.collectionId, collection[0].id));
    assert.equal(children.length, 0);
  });
});
