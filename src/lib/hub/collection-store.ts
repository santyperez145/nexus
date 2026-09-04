import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { isModelExecutionReady } from "@/lib/catalog/presentation";
import { allRuntimeModels, findModelInCatalog } from "@/lib/catalog/runtime";
import { db, schema, withTransaction, type DbExecutor } from "@/lib/db";
import {
  assertWorkspaceManager,
  canMutateResource,
  resolveOwnedWorkspace,
  userScope,
} from "@/lib/gateway/tenant";
import type { AuthContext } from "@/lib/gateway/types";
import { id } from "@/lib/ids";
import { hubSlug, hubTenantAccess } from "./datasets";
import { findModelRepository, modelRepositoryAccess } from "./model-repository-store";
import { ownedHubNamespace } from "./namespace-store";
import { datasetAccess, findDatasetRepository } from "./repository-store";
import { canReadHubSpace, findHubSpace } from "./space-store";
import {
  collectionItemTypes,
  collectionThemes,
  normalizeCollectionItemPath,
} from "./collections";

type Collection = typeof schema.hubCollections.$inferSelect;
type CollectionItem = typeof schema.hubCollectionItems.$inferSelect;
type Namespace = typeof schema.hubNamespaces.$inferSelect;
export type CollectionItemType = (typeof collectionItemTypes)[number];
export type CollectionTheme = (typeof collectionThemes)[number];
export type HubCollection = Collection & {
  namespace: string;
  namespaceDisplayName: string;
  namespaceVerified: boolean;
};

export type PublicCollectionItem = {
  id: string;
  type: CollectionItemType;
  path: string;
  title: string;
  description: string;
  href: string;
  note: string;
  position: number;
};

type CollectionCreate = {
  namespace: string;
  slug: string;
  title: string;
  description: string;
  visibility: "public" | "private";
  theme: CollectionTheme;
  workspace_id?: string | null;
};

function notFound() {
  return Object.assign(new Error("collection not found"), { status: 404, code: "not_found" });
}

function forbidden() {
  return Object.assign(new Error("collection write access required"), {
    status: 403,
    code: "forbidden",
  });
}

function conflict(message: string) {
  return Object.assign(new Error(message), { status: 409, code: "conflict" });
}

function isUniqueViolation(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    const candidate = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (candidate.code === "23505") return true;
    if (typeof candidate.message === "string" && /unique|duplicate/i.test(candidate.message)) return true;
    current = candidate.cause;
  }
  return false;
}

function combine(collection: Collection, namespace: Namespace): HubCollection {
  return {
    ...collection,
    namespace: namespace.slug,
    namespaceDisplayName: namespace.displayName,
    namespaceVerified: namespace.verified,
  };
}

export function canReadHubCollection(collection: HubCollection, auth: AuthContext | null) {
  return collection.visibility === "public" || hubTenantAccess(auth, collection);
}

export async function findHubCollection(
  namespaceValue: string,
  slugValue: string,
  executor: DbExecutor = db,
) {
  const namespace = hubSlug(namespaceValue, "namespace");
  const slug = hubSlug(slugValue, "collection");
  const [row] = await executor
    .select({ collection: schema.hubCollections, namespace: schema.hubNamespaces })
    .from(schema.hubCollections)
    .innerJoin(schema.hubNamespaces, eq(schema.hubNamespaces.id, schema.hubCollections.namespaceId))
    .where(and(eq(schema.hubNamespaces.slug, namespace), eq(schema.hubCollections.slug, slug)))
    .limit(1);
  return row ? combine(row.collection, row.namespace) : null;
}

export async function listHubCollections(input: {
  auth?: AuthContext | null;
  mine?: boolean;
  query?: string;
  owner?: string;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(input.limit ?? 50, 100));
  const search = input.query?.trim().slice(0, 120);
  const base = input.mine
    ? input.auth
      ? userScope(input.auth, schema.hubCollections.userId, schema.hubCollections.workspaceId)
      : sql`false`
    : eq(schema.hubCollections.visibility, "public");
  let where = search
    ? and(
        base,
        or(
          ilike(schema.hubCollections.title, `%${search}%`),
          ilike(schema.hubCollections.slug, `%${search}%`),
          ilike(schema.hubNamespaces.slug, `%${search}%`),
        ),
      )
    : base;
  if (input.owner) where = and(where, eq(schema.hubNamespaces.slug, hubSlug(input.owner, "owner")));
  const rows = await db
    .select({ collection: schema.hubCollections, namespace: schema.hubNamespaces })
    .from(schema.hubCollections)
    .innerJoin(schema.hubNamespaces, eq(schema.hubNamespaces.id, schema.hubCollections.namespaceId))
    .where(where)
    .orderBy(desc(schema.hubCollections.updatedAt))
    .limit(limit);
  return rows.map((row) => combine(row.collection, row.namespace));
}

async function resolveItem(
  item: CollectionItem,
  auth: AuthContext | null,
  catalog: Awaited<ReturnType<typeof allRuntimeModels>>,
): Promise<PublicCollectionItem | null> {
  const type = item.itemType as CollectionItemType;
  if (type === "model") {
    const runtime = findModelInCatalog(item.itemPath, catalog);
    if (runtime && isModelExecutionReady(runtime)) {
      return {
        id: item.id,
        type,
        path: runtime.id,
        title: runtime.name,
        description: runtime.description,
        href: `/models/${runtime.id}`,
        note: item.note,
        position: item.position,
      };
    }
    const [namespace, slug] = item.itemPath.split("/");
    const repository = await findModelRepository(namespace, slug);
    if (!repository || !(await modelRepositoryAccess(repository, auth)).metadata) return null;
    return {
      id: item.id,
      type,
      path: item.itemPath,
      title: repository.title,
      description: repository.description,
      href: `/models/${item.itemPath}`,
      note: item.note,
      position: item.position,
    };
  }
  if (type === "dataset") {
    const [namespace, slug] = item.itemPath.split("/");
    const repository = await findDatasetRepository(namespace, slug);
    if (!repository || !(await datasetAccess(repository, auth)).metadata) return null;
    return {
      id: item.id,
      type,
      path: item.itemPath,
      title: repository.title,
      description: repository.description,
      href: `/datasets/${item.itemPath}`,
      note: item.note,
      position: item.position,
    };
  }
  const [namespace, slug] = item.itemPath.split("/");
  const space = await findHubSpace(namespace, slug);
  if (!space || !canReadHubSpace(space, auth)) return null;
  return {
    id: item.id,
    type,
    path: item.itemPath,
    title: space.title,
    description: space.description,
    href: `/spaces/${item.itemPath}`,
    note: item.note,
    position: item.position,
  };
}

export async function listHubCollectionItems(
  collection: HubCollection,
  auth: AuthContext | null,
  catalogOverride?: Awaited<ReturnType<typeof allRuntimeModels>>,
) {
  const rows = await db
    .select()
    .from(schema.hubCollectionItems)
    .where(eq(schema.hubCollectionItems.collectionId, collection.id))
    .orderBy(asc(schema.hubCollectionItems.position), asc(schema.hubCollectionItems.createdAt));
  const catalog = rows.some((row) => row.itemType === "model")
    ? catalogOverride ?? (await allRuntimeModels())
    : [];
  const resolved = await Promise.all(rows.map((row) => resolveItem(row, auth, catalog)));
  return resolved.filter((item): item is PublicCollectionItem => Boolean(item));
}

export function publicHubCollection(
  collection: HubCollection,
  items: PublicCollectionItem[],
  manager = false,
) {
  return {
    id: collection.id,
    namespace: collection.namespace,
    namespace_name: collection.namespaceDisplayName,
    namespace_verified: collection.namespaceVerified,
    slug: collection.slug,
    path: `${collection.namespace}/${collection.slug}`,
    title: collection.title,
    description: collection.description,
    visibility: collection.visibility,
    theme: collection.theme as CollectionTheme,
    item_count: items.length,
    items,
    access: { manager },
    created_at: collection.createdAt,
    updated_at: collection.updatedAt,
  };
}

export async function createHubCollection(auth: AuthContext, input: CollectionCreate) {
  const workspaceId = await resolveOwnedWorkspace(auth, input.workspace_id);
  await assertWorkspaceManager(auth, workspaceId);
  const namespaceSlug = hubSlug(input.namespace, "namespace");
  const collectionSlug = hubSlug(input.slug, "collection");
  try {
    return await withTransaction(async (tx) => {
      const namespace = await ownedHubNamespace(
        tx,
        auth,
        namespaceSlug,
        input.namespace.trim(),
        workspaceId,
      );
      const row = {
        id: id("collection"),
        namespaceId: namespace.id,
        userId: auth.userId,
        workspaceId,
        slug: collectionSlug,
        title: input.title,
        description: input.description,
        visibility: input.visibility,
        theme: input.theme,
      };
      await tx.insert(schema.hubCollections).values(row);
      return combine({ ...row, createdAt: new Date(), updatedAt: new Date() }, namespace);
    });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "conflict") throw error;
    if (isUniqueViolation(error)) {
      throw conflict("collection path already exists");
    }
    throw error;
  }
}

export async function assertHubCollectionMutation(auth: AuthContext, namespace: string, slug: string) {
  const collection = await findHubCollection(namespace, slug);
  if (!collection) throw notFound();
  if (!(await canMutateResource(auth, collection))) throw forbidden();
  return collection;
}

export async function updateHubCollection(
  auth: AuthContext,
  namespace: string,
  slug: string,
  patch: Partial<Pick<Collection, "title" | "description" | "visibility" | "theme">>,
) {
  const collection = await assertHubCollectionMutation(auth, namespace, slug);
  await db
    .update(schema.hubCollections)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.hubCollections.id, collection.id));
  return findHubCollection(namespace, slug);
}

export async function deleteHubCollection(auth: AuthContext, namespace: string, slug: string) {
  const collection = await assertHubCollectionMutation(auth, namespace, slug);
  await db.delete(schema.hubCollections).where(eq(schema.hubCollections.id, collection.id));
  return collection;
}

export async function addHubCollectionItem(
  auth: AuthContext,
  namespace: string,
  slug: string,
  input: { type: CollectionItemType; path: string; note: string },
) {
  const collection = await assertHubCollectionMutation(auth, namespace, slug);
  const itemPath = normalizeCollectionItemPath(input.path);
  const catalog = input.type === "model" ? await allRuntimeModels() : [];
  const now = new Date();
  const candidate = {
    id: "candidate",
    collectionId: collection.id,
    itemType: input.type,
    itemPath,
    note: input.note,
    position: 0,
    createdBy: auth.userId,
    createdAt: now,
    updatedAt: now,
  } satisfies CollectionItem;
  if (!(await resolveItem(candidate, auth, catalog))) {
    throw Object.assign(new Error("collection item is missing or inaccessible"), {
      status: 404,
      code: "not_found",
    });
  }
  try {
    return await withTransaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM hub_collection WHERE id = ${collection.id} FOR UPDATE`);
      const existing = await tx
        .select({ id: schema.hubCollectionItems.id })
        .from(schema.hubCollectionItems)
        .where(eq(schema.hubCollectionItems.collectionId, collection.id));
      if (existing.length >= 100) {
        throw Object.assign(new Error("collection cannot exceed 100 items"), {
          status: 409,
          code: "limit_exceeded",
        });
      }
      const row = {
        id: id("collection_item"),
        collectionId: collection.id,
        itemType: input.type,
        itemPath,
        note: input.note,
        position: existing.length,
        createdBy: auth.userId,
      };
      await tx.insert(schema.hubCollectionItems).values(row);
      await tx
        .update(schema.hubCollections)
        .set({ updatedAt: new Date() })
        .where(eq(schema.hubCollections.id, collection.id));
      return { ...row, createdAt: new Date(), updatedAt: new Date() };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict("item is already in this collection");
    }
    throw error;
  }
}

export async function updateHubCollectionItem(
  auth: AuthContext,
  namespace: string,
  slug: string,
  itemId: string,
  note: string,
) {
  const collection = await assertHubCollectionMutation(auth, namespace, slug);
  const [item] = await db
    .select()
    .from(schema.hubCollectionItems)
    .where(
      and(
        eq(schema.hubCollectionItems.id, itemId),
        eq(schema.hubCollectionItems.collectionId, collection.id),
      ),
    )
    .limit(1);
  if (!item) throw notFound();
  const updatedAt = new Date();
  await db
    .update(schema.hubCollectionItems)
    .set({ note, updatedAt })
    .where(eq(schema.hubCollectionItems.id, item.id));
  return { ...item, note, updatedAt };
}

async function compactPositions(tx: DbExecutor, collectionId: string) {
  const rows = await tx
    .select({ id: schema.hubCollectionItems.id })
    .from(schema.hubCollectionItems)
    .where(eq(schema.hubCollectionItems.collectionId, collectionId))
    .orderBy(asc(schema.hubCollectionItems.position), asc(schema.hubCollectionItems.createdAt));
  if (!rows.length) return;
  await tx
    .update(schema.hubCollectionItems)
    .set({ position: sql`${schema.hubCollectionItems.position} + 500` })
    .where(eq(schema.hubCollectionItems.collectionId, collectionId));
  for (const [position, row] of rows.entries()) {
    await tx
      .update(schema.hubCollectionItems)
      .set({ position, updatedAt: new Date() })
      .where(eq(schema.hubCollectionItems.id, row.id));
  }
}

export async function removeHubCollectionItem(
  auth: AuthContext,
  namespace: string,
  slug: string,
  itemId: string,
) {
  const collection = await assertHubCollectionMutation(auth, namespace, slug);
  await withTransaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM hub_collection WHERE id = ${collection.id} FOR UPDATE`);
    const deleted = await tx
      .delete(schema.hubCollectionItems)
      .where(
        and(
          eq(schema.hubCollectionItems.id, itemId),
          eq(schema.hubCollectionItems.collectionId, collection.id),
        ),
      )
      .returning();
    if (!deleted.length) throw notFound();
    await compactPositions(tx, collection.id);
    await tx
      .update(schema.hubCollections)
      .set({ updatedAt: new Date() })
      .where(eq(schema.hubCollections.id, collection.id));
  });
}

export async function reorderHubCollectionItems(
  auth: AuthContext,
  namespace: string,
  slug: string,
  itemIds: string[],
) {
  const collection = await assertHubCollectionMutation(auth, namespace, slug);
  if (new Set(itemIds).size !== itemIds.length) {
    throw Object.assign(new Error("item_ids must be unique"), {
      status: 400,
      code: "invalid_request",
    });
  }
  await withTransaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM hub_collection WHERE id = ${collection.id} FOR UPDATE`);
    const stored = await tx
      .select({ id: schema.hubCollectionItems.id })
      .from(schema.hubCollectionItems)
      .where(eq(schema.hubCollectionItems.collectionId, collection.id));
    if (stored.length !== itemIds.length || stored.some((row) => !itemIds.includes(row.id))) {
      throw Object.assign(new Error("item_ids must contain every collection item exactly once"), {
        status: 400,
        code: "invalid_request",
      });
    }
    if (stored.length) {
      await tx
        .update(schema.hubCollectionItems)
        .set({ position: sql`${schema.hubCollectionItems.position} + 500` })
        .where(eq(schema.hubCollectionItems.collectionId, collection.id));
      for (const [position, itemId] of itemIds.entries()) {
        await tx
          .update(schema.hubCollectionItems)
          .set({ position, updatedAt: new Date() })
          .where(eq(schema.hubCollectionItems.id, itemId));
      }
    }
    await tx
      .update(schema.hubCollections)
      .set({ updatedAt: new Date() })
      .where(eq(schema.hubCollections.id, collection.id));
  });
}

export async function collectionManager(auth: AuthContext | null, collection: HubCollection) {
  return Boolean(auth && (await canMutateResource(auth, collection)));
}
