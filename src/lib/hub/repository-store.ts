import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db, schema, withTransaction, type DbExecutor } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { resolveOwnedWorkspace, userScope } from "@/lib/gateway/tenant";
import type { AuthContext } from "@/lib/gateway/types";
import { id } from "@/lib/ids";
import {
  assertUniqueRevisionPaths,
  datasetContentReadable,
  datasetMetadataVisible,
  hubSlug,
  hubTenantAccess,
  normalizeDatasetPath,
  normalizeTags,
  parseDatasetRevision,
} from "./datasets";
import { ownedHubNamespace } from "./namespace-store";

type Repository = typeof schema.hubRepositories.$inferSelect;
type Namespace = typeof schema.hubNamespaces.$inferSelect;
export type DatasetRepository = Repository & {
  namespace: string;
  namespaceDisplayName: string;
  namespaceVerified: boolean;
};

type DatasetCreate = {
  namespace: string;
  slug: string;
  title: string;
  description: string;
  visibility: "public" | "private";
  gated: boolean;
  license: string;
  task?: string | null;
  tags: string[];
  workspace_id?: string | null;
};

type RevisionCreate = {
  commit_message: string;
  metadata: Record<string, unknown>;
  files: Array<{ file_id: string; path: string }>;
};

function notFound() {
  return Object.assign(new Error("dataset not found"), { status: 404, code: "not_found" });
}

function forbidden() {
  return Object.assign(new Error("dataset write access required"), { status: 403, code: "forbidden" });
}

function conflict(message: string) {
  return Object.assign(new Error(message), { status: 409, code: "conflict" });
}

function combine(repository: Repository, namespace: Namespace): DatasetRepository {
  return {
    ...repository,
    namespace: namespace.slug,
    namespaceDisplayName: namespace.displayName,
    namespaceVerified: namespace.verified,
  };
}

export function publicDataset(repository: DatasetRepository) {
  return {
    id: repository.id,
    namespace: repository.namespace,
    namespace_name: repository.namespaceDisplayName,
    namespace_verified: repository.namespaceVerified,
    slug: repository.slug,
    path: `${repository.namespace}/${repository.slug}`,
    title: repository.title,
    description: repository.description,
    visibility: repository.visibility,
    gated: repository.gated,
    license: repository.license,
    task: repository.task,
    tags: repository.tags,
    latest_revision: repository.latestRevision,
    downloads: repository.downloads,
    created_at: repository.createdAt,
    updated_at: repository.updatedAt,
  };
}

export async function findDatasetRepository(
  namespaceValue: string,
  slugValue: string,
  executor: DbExecutor = db,
) {
  const namespace = hubSlug(namespaceValue, "namespace");
  const slug = hubSlug(slugValue, "dataset");
  const [row] = await executor
    .select({ repository: schema.hubRepositories, namespace: schema.hubNamespaces })
    .from(schema.hubRepositories)
    .innerJoin(
      schema.hubNamespaces,
      eq(schema.hubNamespaces.id, schema.hubRepositories.namespaceId),
    )
    .where(and(eq(schema.hubNamespaces.slug, namespace), eq(schema.hubRepositories.slug, slug)))
    .limit(1);
  return row ? combine(row.repository, row.namespace) : null;
}

export async function hasApprovedDatasetGrant(repositoryId: string, auth: AuthContext | null) {
  if (!auth || auth.guest) return false;
  const [grant] = await db
    .select({ id: schema.hubAccessGrants.id })
    .from(schema.hubAccessGrants)
    .where(
      and(
        eq(schema.hubAccessGrants.repositoryId, repositoryId),
        eq(schema.hubAccessGrants.userId, auth.userId),
        eq(schema.hubAccessGrants.status, "approved"),
      ),
    )
    .limit(1);
  return Boolean(grant);
}

export async function datasetAccess(repository: DatasetRepository, auth: AuthContext | null) {
  const approved = await hasApprovedDatasetGrant(repository.id, auth);
  const tenant = hubTenantAccess(auth, repository);
  const manager = tenant;
  return {
    metadata: datasetMetadataVisible(repository, auth, approved),
    content: datasetContentReadable(repository, auth, approved),
    tenant,
    manager,
    approved,
  };
}

export async function listDatasetRepositories(input: {
  auth?: AuthContext | null;
  mine?: boolean;
  query?: string;
  task?: string;
  tag?: string;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(input.limit ?? 50, 100));
  const search = input.query?.trim().slice(0, 120);
  const base = input.mine
    ? input.auth
      ? userScope(input.auth, schema.hubRepositories.userId, schema.hubRepositories.workspaceId)
      : sql`false`
    : eq(schema.hubRepositories.visibility, "public");
  const where = search
    ? and(
        base,
        or(
          ilike(schema.hubRepositories.title, `%${search}%`),
          ilike(schema.hubRepositories.slug, `%${search}%`),
          ilike(schema.hubNamespaces.slug, `%${search}%`),
        ),
      )
    : base;
  const rows = await db
    .select({ repository: schema.hubRepositories, namespace: schema.hubNamespaces })
    .from(schema.hubRepositories)
    .innerJoin(
      schema.hubNamespaces,
      eq(schema.hubNamespaces.id, schema.hubRepositories.namespaceId),
    )
    .where(where)
    .orderBy(desc(schema.hubRepositories.updatedAt))
    .limit(200);
  return rows
    .map((row) => combine(row.repository, row.namespace))
    .filter((row) => !input.task || row.task === input.task)
    .filter((row) => !input.tag || row.tags.includes(input.tag))
    .slice(0, limit);
}

export async function createDatasetRepository(auth: AuthContext, input: DatasetCreate) {
  const workspaceId = await resolveOwnedWorkspace(auth, input.workspace_id);
  const namespaceSlug = hubSlug(input.namespace, "namespace");
  const repositorySlug = hubSlug(input.slug, "dataset");
  const tags = normalizeTags(input.tags);
  try {
    const created = await withTransaction(async (tx) => {
      const namespace = await ownedHubNamespace(tx, auth, namespaceSlug, input.namespace.trim(), workspaceId);
      const row = {
        id: id("ds"),
        namespaceId: namespace.id,
        userId: auth.userId,
        workspaceId,
        slug: repositorySlug,
        title: input.title,
        description: input.description,
        visibility: input.visibility,
        gated: input.gated,
        license: input.license,
        task: input.task || null,
        tags,
      };
      await tx.insert(schema.hubRepositories).values(row);
      return combine(
        { ...row, latestRevision: 0, downloads: 0, createdAt: new Date(), updatedAt: new Date() },
        namespace,
      );
    });
    return created;
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "conflict") throw error;
    const message = error instanceof Error ? error.message : "";
    if (/unique|duplicate/i.test(message)) throw conflict("dataset path already exists");
    throw error;
  }
}

export async function assertDatasetMutation(
  auth: AuthContext,
  namespace: string,
  slug: string,
) {
  const repository = await findDatasetRepository(namespace, slug);
  if (!repository) throw notFound();
  if (!hubTenantAccess(auth, repository)) throw forbidden();
  return repository;
}

export async function updateDatasetRepository(
  auth: AuthContext,
  namespace: string,
  slug: string,
  patch: Partial<Pick<Repository, "title" | "description" | "visibility" | "gated" | "license" | "task" | "tags">>,
) {
  const repository = await assertDatasetMutation(auth, namespace, slug);
  await db
    .update(schema.hubRepositories)
    .set({
      ...patch,
      ...(patch.tags ? { tags: normalizeTags(patch.tags) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.hubRepositories.id, repository.id));
  return findDatasetRepository(namespace, slug);
}

export async function deleteDatasetRepository(auth: AuthContext, namespace: string, slug: string) {
  const repository = await assertDatasetMutation(auth, namespace, slug);
  await db.delete(schema.hubRepositories).where(eq(schema.hubRepositories.id, repository.id));
  return repository;
}

export async function createDatasetRevision(
  auth: AuthContext,
  namespace: string,
  slug: string,
  input: RevisionCreate,
) {
  const repository = await assertDatasetMutation(auth, namespace, slug);
  assertUniqueRevisionPaths(input.files);
  const fileIds = [...new Set(input.files.map((file) => file.file_id))];
  const storedFiles = await db
    .select()
    .from(schema.files)
    .where(inArray(schema.files.id, fileIds));
  const storedById = new Map(storedFiles.map((file) => [file.id, file]));
  for (const requested of input.files) {
    const file = storedById.get(requested.file_id);
    const exactScope = repository.workspaceId
      ? file?.workspaceId === repository.workspaceId
      : file?.workspaceId == null && file?.userId === repository.userId;
    if (!file || !hubTenantAccess(auth, file) || !exactScope) {
      throw Object.assign(new Error(`file is outside the dataset tenant: ${requested.file_id}`), {
        status: 404,
        code: "not_found",
      });
    }
  }

  return withTransaction(async (tx) => {
    await tx.execute(sql`
      SELECT id
      FROM hub_repository
      WHERE id = ${repository.id}
      FOR UPDATE
    `);
    const [locked] = await tx
      .select({ latestRevision: schema.hubRepositories.latestRevision })
      .from(schema.hubRepositories)
      .where(eq(schema.hubRepositories.id, repository.id))
      .limit(1);
    if (!locked) throw notFound();
    const revision = Number(locked.latestRevision) + 1;
    const normalizedFiles = input.files.map((file) => ({
      fileId: file.file_id,
      path: normalizeDatasetPath(file.path),
    }));
    const commitSha = sha256(
      JSON.stringify({ repository: repository.id, revision, files: normalizedFiles, metadata: input.metadata }),
    ).slice(0, 16);
    const revisionRow = {
      id: id("rev"),
      repositoryId: repository.id,
      revision,
      commitSha,
      commitMessage: input.commit_message,
      metadata: input.metadata,
      createdBy: auth.userId,
    };
    await tx.insert(schema.hubRevisions).values(revisionRow);
    await tx.insert(schema.hubRevisionFiles).values(
      normalizedFiles.map((file) => ({
        id: id("rf"),
        revisionId: revisionRow.id,
        fileId: file.fileId,
        path: file.path,
      })),
    );
    await tx
      .update(schema.hubRepositories)
      .set({ latestRevision: revision, updatedAt: new Date() })
      .where(eq(schema.hubRepositories.id, repository.id));
    return { ...revisionRow, createdAt: new Date(), files: normalizedFiles };
  });
}

export async function listDatasetRevisions(repositoryId: string) {
  const revisions = await db
    .select()
    .from(schema.hubRevisions)
    .where(eq(schema.hubRevisions.repositoryId, repositoryId))
    .orderBy(desc(schema.hubRevisions.revision));
  if (!revisions.length) return [];
  const revisionIds = revisions.map((revision) => revision.id);
  const files = await db
    .select({
      id: schema.hubRevisionFiles.id,
      revisionId: schema.hubRevisionFiles.revisionId,
      fileId: schema.hubRevisionFiles.fileId,
      path: schema.hubRevisionFiles.path,
      filename: schema.files.filename,
      mime: schema.files.mime,
      size: schema.files.size,
    })
    .from(schema.hubRevisionFiles)
    .innerJoin(schema.files, eq(schema.files.id, schema.hubRevisionFiles.fileId))
    .where(inArray(schema.hubRevisionFiles.revisionId, revisionIds));
  return revisions.map((revision) => ({
    ...revision,
    files: files.filter((file) => file.revisionId === revision.id),
  }));
}

export async function resolveDatasetFile(
  repository: DatasetRepository,
  revisionValue: string,
  pathValue: string,
) {
  const revisionSelector = parseDatasetRevision(revisionValue, repository.latestRevision);
  const revisionWhere =
    typeof revisionSelector === "number"
      ? eq(schema.hubRevisions.revision, revisionSelector)
      : eq(schema.hubRevisions.commitSha, revisionSelector);
  const [revision] = await db
    .select()
    .from(schema.hubRevisions)
    .where(and(eq(schema.hubRevisions.repositoryId, repository.id), revisionWhere))
    .limit(1);
  if (!revision) throw notFound();
  const path = normalizeDatasetPath(pathValue);
  const [file] = await db
    .select({
      id: schema.files.id,
      filename: schema.files.filename,
      mime: schema.files.mime,
      size: schema.files.size,
      content: schema.files.content,
      path: schema.hubRevisionFiles.path,
    })
    .from(schema.hubRevisionFiles)
    .innerJoin(schema.files, eq(schema.files.id, schema.hubRevisionFiles.fileId))
    .where(
      and(
        eq(schema.hubRevisionFiles.revisionId, revision.id),
        eq(schema.hubRevisionFiles.path, path),
      ),
    )
    .limit(1);
  if (!file) throw notFound();
  return { revision, file };
}

export async function requestDatasetAccess(auth: AuthContext, repository: DatasetRepository) {
  if (repository.visibility !== "public" || !repository.gated) throw notFound();
  if (hubTenantAccess(auth, repository)) return { status: "owner" as const };
  const row = {
    id: id("grant"),
    repositoryId: repository.id,
    userId: auth.userId,
    status: "pending",
    requestedAt: new Date(),
    decidedAt: null,
    decidedBy: null,
  };
  await db
    .insert(schema.hubAccessGrants)
    .values(row)
    .onConflictDoUpdate({
      target: [schema.hubAccessGrants.repositoryId, schema.hubAccessGrants.userId],
      set: { status: "pending", requestedAt: row.requestedAt, decidedAt: null, decidedBy: null },
    });
  return { status: "pending" as const };
}

export async function listDatasetAccess(auth: AuthContext, repository: DatasetRepository) {
  const manager = hubTenantAccess(auth, repository);
  if (!manager) {
    if (repository.visibility !== "public") throw notFound();
    const [grant] = await db
      .select({ status: schema.hubAccessGrants.status, requestedAt: schema.hubAccessGrants.requestedAt })
      .from(schema.hubAccessGrants)
      .where(
        and(
          eq(schema.hubAccessGrants.repositoryId, repository.id),
          eq(schema.hubAccessGrants.userId, auth.userId),
        ),
      )
      .limit(1);
    return { manager: false, grants: grant ? [grant] : [] };
  }
  const grants = await db
    .select({
      id: schema.hubAccessGrants.id,
      userId: schema.hubAccessGrants.userId,
      name: schema.users.name,
      email: schema.users.email,
      status: schema.hubAccessGrants.status,
      requestedAt: schema.hubAccessGrants.requestedAt,
      decidedAt: schema.hubAccessGrants.decidedAt,
    })
    .from(schema.hubAccessGrants)
    .innerJoin(schema.users, eq(schema.users.id, schema.hubAccessGrants.userId))
    .where(eq(schema.hubAccessGrants.repositoryId, repository.id))
    .orderBy(desc(schema.hubAccessGrants.requestedAt));
  return { manager: true, grants };
}

export async function decideDatasetAccess(
  auth: AuthContext,
  repository: DatasetRepository,
  grantId: string,
  status: "approved" | "rejected",
) {
  if (!hubTenantAccess(auth, repository)) throw forbidden();
  const [grant] = await db
    .select()
    .from(schema.hubAccessGrants)
    .where(
      and(
        eq(schema.hubAccessGrants.id, grantId),
        eq(schema.hubAccessGrants.repositoryId, repository.id),
      ),
    )
    .limit(1);
  if (!grant) throw notFound();
  const decidedAt = new Date();
  await db
    .update(schema.hubAccessGrants)
    .set({ status, decidedAt, decidedBy: auth.userId })
    .where(eq(schema.hubAccessGrants.id, grant.id));
  return { ...grant, status, decidedAt, decidedBy: auth.userId };
}

export async function fileReferencedByDataset(fileId: string) {
  const [reference] = await db
    .select({ id: schema.hubRevisionFiles.id })
    .from(schema.hubRevisionFiles)
    .where(eq(schema.hubRevisionFiles.fileId, fileId))
    .limit(1);
  return Boolean(reference);
}
