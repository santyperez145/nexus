import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db, schema, withTransaction, type DbExecutor } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { resolveOwnedWorkspace, userScope } from "@/lib/gateway/tenant";
import type { AuthContext } from "@/lib/gateway/types";
import { id } from "@/lib/ids";
import { hubTenantAccess } from "./datasets";
import {
  hubSlug,
  normalizeModelPath,
  normalizeTags,
  parseModelRevision,
} from "./model-repositories";
import { ownedHubNamespace } from "./namespace-store";

type Repository = typeof schema.hubRepositories.$inferSelect;
type Namespace = typeof schema.hubNamespaces.$inferSelect;
export type ModelRepository = Repository & {
  namespace: string;
  namespaceDisplayName: string;
  namespaceVerified: boolean;
};

type ModelCreate = {
  namespace: string;
  slug: string;
  title: string;
  description: string;
  model_card: string;
  visibility: "public" | "private";
  gated: boolean;
  license: string;
  pipeline_tag?: string | null;
  library_name?: string | null;
  base_model?: string | null;
  tags: string[];
  workspace_id?: string | null;
};

type RevisionCreate = {
  commit_message: string;
  metadata: Record<string, unknown>;
  files: Array<{ file_id: string; path: string }>;
};

function notFound() {
  return Object.assign(new Error("model repository not found"), { status: 404, code: "not_found" });
}

function forbidden() {
  return Object.assign(new Error("model repository write access required"), {
    status: 403,
    code: "forbidden",
  });
}

function combine(repository: Repository, namespace: Namespace): ModelRepository {
  return {
    ...repository,
    namespace: namespace.slug,
    namespaceDisplayName: namespace.displayName,
    namespaceVerified: namespace.verified,
  };
}

export function publicModelRepository(repository: ModelRepository) {
  return {
    id: repository.id,
    namespace: repository.namespace,
    namespace_name: repository.namespaceDisplayName,
    namespace_verified: repository.namespaceVerified,
    slug: repository.slug,
    path: `${repository.namespace}/${repository.slug}`,
    title: repository.title,
    description: repository.description,
    model_card: repository.modelCard ?? "",
    visibility: repository.visibility,
    gated: repository.gated,
    license: repository.license,
    pipeline_tag: repository.task,
    library_name: repository.libraryName,
    base_model: repository.baseModel,
    tags: repository.tags,
    latest_revision: repository.latestRevision,
    downloads: repository.downloads,
    created_at: repository.createdAt,
    updated_at: repository.updatedAt,
    nexus: {
      source: "hub",
      executable: false,
      reference_only: true,
      verification_status: repository.verificationStatus,
      verified_revision: repository.verifiedRevision,
      current_revision_verified:
        repository.verificationStatus === "verified" &&
        repository.verifiedRevision === repository.latestRevision,
      runtime_model_id: repository.runtimeModelId,
      promoted: repository.verificationStatus === "verified" && Boolean(repository.runtimeModelId),
      verified_at: repository.verifiedAt,
    },
  };
}

export async function findModelRepository(
  namespaceValue: string,
  slugValue: string,
  executor: DbExecutor = db,
) {
  const namespace = hubSlug(namespaceValue, "namespace");
  const slug = hubSlug(slugValue, "model");
  const [row] = await executor
    .select({ repository: schema.hubRepositories, namespace: schema.hubNamespaces })
    .from(schema.hubRepositories)
    .innerJoin(schema.hubNamespaces, eq(schema.hubNamespaces.id, schema.hubRepositories.namespaceId))
    .where(
      and(
        eq(schema.hubRepositories.kind, "model"),
        eq(schema.hubNamespaces.slug, namespace),
        eq(schema.hubRepositories.slug, slug),
      ),
    )
    .limit(1);
  return row ? combine(row.repository, row.namespace) : null;
}

function modelTenantAccess(
  auth: AuthContext | null,
  repository: { userId: string; workspaceId?: string | null },
) {
  if (!auth) return false;
  if (auth.apiKeyId && !auth.isManagement) return false;
  return hubTenantAccess(auth, repository);
}

async function hasApprovedGrant(repositoryId: string, auth: AuthContext | null) {
  if (!auth || auth.guest || (auth.apiKeyId && !auth.isManagement)) return false;
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

export async function modelRepositoryAccess(repository: ModelRepository, auth: AuthContext | null) {
  const approved = await hasApprovedGrant(repository.id, auth);
  const tenant = modelTenantAccess(auth, repository);
  return {
    metadata: repository.visibility === "public" || approved || tenant,
    content: tenant || approved || (repository.visibility === "public" && !repository.gated),
    tenant,
    manager: tenant,
    approved,
  };
}

export async function listModelRepositories(input: {
  auth?: AuthContext | null;
  mine?: boolean;
  query?: string;
  pipelineTag?: string;
  tag?: string;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(input.limit ?? 50, 100));
  const search = input.query?.trim().slice(0, 120);
  const visibility = input.mine
    ? input.auth
      ? userScope(input.auth, schema.hubRepositories.userId, schema.hubRepositories.workspaceId)
      : sql`false`
    : eq(schema.hubRepositories.visibility, "public");
  const base = and(eq(schema.hubRepositories.kind, "model"), visibility);
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
    .innerJoin(schema.hubNamespaces, eq(schema.hubNamespaces.id, schema.hubRepositories.namespaceId))
    .where(where)
    .orderBy(desc(schema.hubRepositories.updatedAt))
    .limit(200);
  return rows
    .map((row) => combine(row.repository, row.namespace))
    .filter((row) => !input.pipelineTag || row.task === input.pipelineTag)
    .filter((row) => !input.tag || row.tags.includes(input.tag))
    .slice(0, limit);
}

export async function createModelRepository(auth: AuthContext, input: ModelCreate) {
  const workspaceId = await resolveOwnedWorkspace(auth, input.workspace_id);
  const namespaceSlug = hubSlug(input.namespace, "namespace");
  const repositorySlug = hubSlug(input.slug, "model");
  try {
    return await withTransaction(async (tx) => {
      const namespace = await ownedHubNamespace(tx, auth, namespaceSlug, input.namespace.trim(), workspaceId);
      const row = {
        id: id("mdlrepo"),
        kind: "model",
        namespaceId: namespace.id,
        userId: auth.userId,
        workspaceId,
        slug: repositorySlug,
        title: input.title,
        description: input.description,
        modelCard: input.model_card,
        visibility: input.visibility,
        gated: input.gated,
        license: input.license,
        task: input.pipeline_tag || null,
        libraryName: input.library_name || null,
        baseModel: input.base_model || null,
        tags: normalizeTags(input.tags),
      };
      await tx.insert(schema.hubRepositories).values(row);
      return combine(
        {
          ...row,
          latestRevision: 0,
          downloads: 0,
          verificationStatus: "unverified",
          verifiedRevision: null,
          runtimeModelId: null,
          verifiedAt: null,
          verifiedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        namespace,
      );
    });
  } catch (error) {
    if (/unique|duplicate/i.test(error instanceof Error ? error.message : "")) {
      throw Object.assign(new Error("model path already exists"), { status: 409, code: "conflict" });
    }
    throw error;
  }
}

export async function assertModelRepositoryMutation(auth: AuthContext, namespace: string, slug: string) {
  const repository = await findModelRepository(namespace, slug);
  if (!repository) throw notFound();
  if (!modelTenantAccess(auth, repository)) throw forbidden();
  return repository;
}

export async function updateModelRepository(
  auth: AuthContext,
  namespace: string,
  slug: string,
  patch: {
    title?: string;
    description?: string;
    model_card?: string;
    visibility?: "public" | "private";
    gated?: boolean;
    license?: string;
    pipeline_tag?: string | null;
    library_name?: string | null;
    base_model?: string | null;
    tags?: string[];
  },
) {
  const repository = await assertModelRepositoryMutation(auth, namespace, slug);
  await db
    .update(schema.hubRepositories)
    .set({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.model_card !== undefined ? { modelCard: patch.model_card } : {}),
      ...(patch.visibility !== undefined ? { visibility: patch.visibility } : {}),
      ...(patch.gated !== undefined ? { gated: patch.gated } : {}),
      ...(patch.license !== undefined ? { license: patch.license } : {}),
      ...(patch.pipeline_tag !== undefined ? { task: patch.pipeline_tag } : {}),
      ...(patch.library_name !== undefined ? { libraryName: patch.library_name } : {}),
      ...(patch.base_model !== undefined ? { baseModel: patch.base_model } : {}),
      ...(patch.tags !== undefined ? { tags: normalizeTags(patch.tags) } : {}),
      ...(repository.verificationStatus === "verified" || repository.verificationStatus === "pending"
        ? { verificationStatus: "stale" }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.hubRepositories.id, repository.id));
  return findModelRepository(namespace, slug);
}

export async function deleteModelRepository(auth: AuthContext, namespace: string, slug: string) {
  const repository = await assertModelRepositoryMutation(auth, namespace, slug);
  await db.delete(schema.hubRepositories).where(eq(schema.hubRepositories.id, repository.id));
  return repository;
}

export async function createModelRevision(
  auth: AuthContext,
  namespace: string,
  slug: string,
  input: RevisionCreate,
) {
  const repository = await assertModelRepositoryMutation(auth, namespace, slug);
  const normalizedFiles = input.files.map((file) => ({
    fileId: file.file_id,
    path: normalizeModelPath(file.path),
  }));
  if (new Set(normalizedFiles.map((file) => file.path)).size !== normalizedFiles.length) {
    throw Object.assign(new Error("duplicate model file path"), { status: 400, code: "invalid_request" });
  }
  const storedFiles = await db
    .select()
    .from(schema.files)
    .where(inArray(schema.files.id, [...new Set(normalizedFiles.map((file) => file.fileId))]));
  const storedById = new Map(storedFiles.map((file) => [file.id, file]));
  for (const requested of normalizedFiles) {
    const file = storedById.get(requested.fileId);
    const exactScope = repository.workspaceId
      ? file?.workspaceId === repository.workspaceId
      : file?.workspaceId == null && file?.userId === repository.userId;
    if (!file || !modelTenantAccess(auth, file) || !exactScope) {
      throw Object.assign(new Error(`file is outside the model tenant: ${requested.fileId}`), {
        status: 404,
        code: "not_found",
      });
    }
    if (file.status !== "ready") {
      throw Object.assign(new Error(`model artifact is not ready: ${requested.fileId}`), {
        status: 409,
        code: "artifact_not_ready",
      });
    }
  }
  return withTransaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM hub_repository WHERE id = ${repository.id} FOR UPDATE`);
    const [locked] = await tx
      .select({ latestRevision: schema.hubRepositories.latestRevision })
      .from(schema.hubRepositories)
      .where(eq(schema.hubRepositories.id, repository.id))
      .limit(1);
    if (!locked) throw notFound();
    const revision = Number(locked.latestRevision) + 1;
    const revisionMetadata = {
      ...input.metadata,
      nexus: {
        reference_only: true,
        executable: false,
        model_card: repository.modelCard ?? "",
        description: repository.description,
        license: repository.license,
        pipeline_tag: repository.task,
        library_name: repository.libraryName,
        base_model: repository.baseModel,
        tags: repository.tags,
      },
    };
    const commitSha = sha256(
      JSON.stringify({ repository: repository.id, revision, files: normalizedFiles, metadata: revisionMetadata }),
    ).slice(0, 16);
    const revisionRow = {
      id: id("mdlrev"),
      repositoryId: repository.id,
      revision,
      commitSha,
      commitMessage: input.commit_message,
      metadata: revisionMetadata,
      createdBy: auth.userId,
    };
    await tx.insert(schema.hubRevisions).values(revisionRow);
    await tx.insert(schema.hubRevisionFiles).values(
      normalizedFiles.map((file) => ({
        id: id("mdlfile"),
        revisionId: revisionRow.id,
        fileId: file.fileId,
        path: file.path,
      })),
    );
    await tx
      .update(schema.hubRepositories)
      .set({
        latestRevision: revision,
        ...(repository.verificationStatus === "unverified"
          ? {}
          : { verificationStatus: "stale" }),
        updatedAt: new Date(),
      })
      .where(eq(schema.hubRepositories.id, repository.id));
    return { ...revisionRow, createdAt: new Date(), files: normalizedFiles };
  });
}

export async function listModelRevisions(repositoryId: string) {
  const revisions = await db
    .select()
    .from(schema.hubRevisions)
    .where(eq(schema.hubRevisions.repositoryId, repositoryId))
    .orderBy(desc(schema.hubRevisions.revision));
  if (!revisions.length) return [];
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
    .where(inArray(schema.hubRevisionFiles.revisionId, revisions.map((revision) => revision.id)));
  return revisions.map((revision) => ({
    ...revision,
    files: files.filter((file) => file.revisionId === revision.id),
  }));
}

export async function resolveModelFile(
  repository: ModelRepository,
  revisionValue: string,
  pathValue: string,
) {
  const selector = parseModelRevision(revisionValue, repository.latestRevision);
  const revisionWhere =
    typeof selector === "number"
      ? eq(schema.hubRevisions.revision, selector)
      : eq(schema.hubRevisions.commitSha, selector);
  const [revision] = await db
    .select()
    .from(schema.hubRevisions)
    .where(and(eq(schema.hubRevisions.repositoryId, repository.id), revisionWhere))
    .limit(1);
  if (!revision) throw notFound();
  const path = normalizeModelPath(pathValue);
  const [file] = await db
    .select({
      id: schema.files.id,
      filename: schema.files.filename,
      mime: schema.files.mime,
      size: schema.files.size,
      content: schema.files.content,
      storageBackend: schema.files.storageBackend,
      storageKey: schema.files.storageKey,
      checksumSha256: schema.files.checksumSha256,
      status: schema.files.status,
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

export async function requestModelAccess(auth: AuthContext, repository: ModelRepository) {
  if (repository.visibility !== "public" || !repository.gated) throw notFound();
  if (modelTenantAccess(auth, repository)) return { status: "owner" as const };
  const row = {
    id: id("mdlgrant"),
    repositoryId: repository.id,
    userId: auth.userId,
    status: "pending",
    requestedAt: new Date(),
    decidedAt: null,
    decidedBy: null,
  };
  await db.insert(schema.hubAccessGrants).values(row).onConflictDoUpdate({
    target: [schema.hubAccessGrants.repositoryId, schema.hubAccessGrants.userId],
    set: { status: "pending", requestedAt: row.requestedAt, decidedAt: null, decidedBy: null },
  });
  return { status: "pending" as const };
}

export async function listModelAccess(auth: AuthContext, repository: ModelRepository) {
  if (!modelTenantAccess(auth, repository)) {
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

export async function decideModelAccess(
  auth: AuthContext,
  repository: ModelRepository,
  grantId: string,
  status: "approved" | "rejected",
) {
  if (!modelTenantAccess(auth, repository)) throw forbidden();
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
