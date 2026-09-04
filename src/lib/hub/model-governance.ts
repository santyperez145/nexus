import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { findModel } from "@/lib/catalog";
import { isModelExecutionReady } from "@/lib/catalog/presentation";
import { db, schema, withTransaction, type DbExecutor } from "@/lib/db";
import type { AuthContext } from "@/lib/gateway/types";
import { id } from "@/lib/ids";
import { assertPublicHttpUrl } from "@/lib/net/public-url";
import {
  assertModelRepositoryMutation,
  type ModelRepository,
} from "./model-repository-store";

const sha256Schema = z.string().trim().toLowerCase().regex(/^[a-f0-9]{64}$/, "evidence_sha256 must be SHA-256 hex");
const shortText = (max: number) => z.string().trim().min(1).max(max);

export const createModelEvaluationSchema = z.object({
  revision: z.number().int().positive(),
  benchmark: shortText(160),
  task: shortText(120),
  dataset: shortText(240),
  dataset_revision: shortText(160).nullable().optional(),
  metric: shortText(120),
  metric_value: z.number().finite().min(-1_000_000_000_000).max(1_000_000_000_000),
  higher_is_better: z.boolean().optional().default(true),
  sample_count: z.number().int().positive().max(1_000_000_000).nullable().optional(),
  evaluator: shortText(160),
  evaluator_version: shortText(120).nullable().optional(),
  evidence_url: z.string().trim().url().max(2_048),
  evidence_sha256: sha256Schema,
});

export const createModelPromotionSchema = z.object({
  revision: z.number().int().positive(),
  runtime_model_id: z
    .string()
    .trim()
    .min(3)
    .max(200)
    .regex(/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:/-]*$/i, "invalid runtime model id"),
});

export const reviewModelGovernanceSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().min(8).max(2_000),
});

export function invalidModelGovernanceInput(error: z.ZodError) {
  return Object.assign(new Error(error.issues[0]?.message ?? "invalid model governance request"), {
    status: 400,
    code: "invalid_request",
  });
}

type Revision = typeof schema.hubRevisions.$inferSelect;
type RevisionArtifact = {
  path: string;
  status: string;
  checksumSha256: string | null;
};

export type PromotionChecklist = {
  latest_revision: boolean;
  public_distribution: boolean;
  model_card: boolean;
  license: boolean;
  task_and_library: boolean;
  artifact_integrity: boolean;
  safe_serialization: boolean;
  verified_evaluation: boolean;
  runtime_ready: boolean;
};

function revisionNexusMetadata(revision: Revision) {
  const root = revision.metadata && typeof revision.metadata === "object" ? revision.metadata : {};
  const nexus = "nexus" in root && root.nexus && typeof root.nexus === "object"
    ? (root.nexus as Record<string, unknown>)
    : {};
  return nexus;
}

const DANGEROUS_MODEL_EXTENSIONS = [".bin", ".pt", ".pth", ".pkl", ".pickle", ".joblib"];
const SAFE_WEIGHT_EXTENSIONS = [".safetensors", ".gguf"];

export function buildPromotionChecklist(input: {
  repository: Pick<ModelRepository, "latestRevision" | "visibility" | "gated">;
  revision: Revision;
  artifacts: RevisionArtifact[];
  verifiedEvaluationCount: number;
  runtimeReady: boolean;
}): PromotionChecklist {
  const metadata = revisionNexusMetadata(input.revision);
  const lowerPaths = input.artifacts.map((artifact) => artifact.path.toLowerCase());
  const hasSafeWeights = lowerPaths.some((path) => SAFE_WEIGHT_EXTENSIONS.some((extension) => path.endsWith(extension)));
  const hasDangerousWeights = lowerPaths.some((path) =>
    DANGEROUS_MODEL_EXTENSIONS.some((extension) => path.endsWith(extension)),
  );
  return {
    latest_revision: input.revision.revision === input.repository.latestRevision,
    public_distribution: input.repository.visibility === "public" && !input.repository.gated,
    model_card: typeof metadata.model_card === "string" && metadata.model_card.trim().length >= 40,
    license:
      typeof metadata.license === "string" &&
      metadata.license.trim().length > 0 &&
      !["other", "unknown", "none"].includes(metadata.license.trim().toLowerCase()),
    task_and_library:
      typeof metadata.pipeline_tag === "string" &&
      metadata.pipeline_tag.trim().length > 0 &&
      typeof metadata.library_name === "string" &&
      metadata.library_name.trim().length > 0,
    artifact_integrity:
      input.artifacts.length > 0 &&
      input.artifacts.every(
        (artifact) => artifact.status === "ready" && /^[a-f0-9]{64}$/i.test(artifact.checksumSha256 ?? ""),
      ),
    safe_serialization: hasSafeWeights && !hasDangerousWeights,
    verified_evaluation: input.verifiedEvaluationCount > 0,
    runtime_ready: input.runtimeReady,
  };
}

function publicEvaluation(
  row: typeof schema.hubModelEvaluations.$inferSelect,
  revision: number,
  includeReviewNote = true,
) {
  return {
    id: row.id,
    revision_id: row.revisionId,
    revision,
    benchmark: row.benchmark,
    task: row.task,
    dataset: row.dataset,
    dataset_revision: row.datasetRevision,
    metric: row.metric,
    metric_value: Number(row.metricValue),
    higher_is_better: row.higherIsBetter,
    sample_count: row.sampleCount,
    evaluator: row.evaluator,
    evaluator_version: row.evaluatorVersion,
    evidence_url: row.evidenceUrl,
    evidence_sha256: row.evidenceSha256,
    status: row.status,
    review_note: includeReviewNote ? row.reviewNote : null,
    created_at: row.createdAt,
    reviewed_at: row.reviewedAt,
  };
}

function publicPromotion(row: typeof schema.hubModelPromotionRequests.$inferSelect) {
  return {
    id: row.id,
    revision_id: row.revisionId,
    runtime_model_id: row.runtimeModelId,
    status: row.status,
    checklist: row.checklist,
    review_note: row.reviewNote,
    created_at: row.createdAt,
    reviewed_at: row.reviewedAt,
  };
}

async function findRepositoryRevision(
  executor: DbExecutor,
  repositoryId: string,
  revision: number,
) {
  const [row] = await executor
    .select()
    .from(schema.hubRevisions)
    .where(and(eq(schema.hubRevisions.repositoryId, repositoryId), eq(schema.hubRevisions.revision, revision)))
    .limit(1);
  if (!row) {
    throw Object.assign(new Error("model revision not found"), { status: 404, code: "not_found" });
  }
  return row;
}

export async function listModelEvaluations(repository: ModelRepository, manager: boolean) {
  const rows = await db
    .select({ evaluation: schema.hubModelEvaluations, revision: schema.hubRevisions.revision })
    .from(schema.hubModelEvaluations)
    .innerJoin(schema.hubRevisions, eq(schema.hubRevisions.id, schema.hubModelEvaluations.revisionId))
    .where(
      manager
        ? eq(schema.hubModelEvaluations.repositoryId, repository.id)
        : and(
            eq(schema.hubModelEvaluations.repositoryId, repository.id),
            eq(schema.hubModelEvaluations.status, "verified"),
          ),
    )
    .orderBy(desc(schema.hubModelEvaluations.createdAt));
  return rows.map((row) => publicEvaluation(row.evaluation, row.revision, manager));
}

export async function createModelEvaluation(
  auth: AuthContext,
  namespace: string,
  slug: string,
  input: z.infer<typeof createModelEvaluationSchema>,
) {
  const repository = await assertModelRepositoryMutation(auth, namespace, slug);
  const revision = await findRepositoryRevision(db, repository.id, input.revision);
  const evidenceUrl = assertPublicHttpUrl(input.evidence_url);
  if (evidenceUrl.protocol !== "https:") {
    throw Object.assign(new Error("evaluation evidence must use HTTPS"), {
      status: 400,
      code: "invalid_request",
    });
  }
  const row = {
    id: id("mdleval"),
    repositoryId: repository.id,
    revisionId: revision.id,
    benchmark: input.benchmark,
    task: input.task,
    dataset: input.dataset,
    datasetRevision: input.dataset_revision ?? null,
    metric: input.metric,
    metricValue: String(input.metric_value),
    higherIsBetter: input.higher_is_better,
    sampleCount: input.sample_count ?? null,
    evaluator: input.evaluator,
    evaluatorVersion: input.evaluator_version ?? null,
    evidenceUrl: input.evidence_url,
    evidenceSha256: input.evidence_sha256,
    status: "submitted",
    submittedBy: auth.userId,
  };
  await db.insert(schema.hubModelEvaluations).values(row);
  const [created] = await db
    .select()
    .from(schema.hubModelEvaluations)
    .where(eq(schema.hubModelEvaluations.id, row.id))
    .limit(1);
  return publicEvaluation(created, revision.revision);
}

export async function listModelPromotions(repository: ModelRepository) {
  const rows = await db
    .select()
    .from(schema.hubModelPromotionRequests)
    .where(eq(schema.hubModelPromotionRequests.repositoryId, repository.id))
    .orderBy(desc(schema.hubModelPromotionRequests.createdAt));
  return rows.map(publicPromotion);
}

export async function createModelPromotion(
  auth: AuthContext,
  namespace: string,
  slug: string,
  input: z.infer<typeof createModelPromotionSchema>,
) {
  const repository = await assertModelRepositoryMutation(auth, namespace, slug);
  if (repository.visibility !== "public" || repository.gated) {
    throw Object.assign(new Error("promotion requires a public repository without an access gate"), {
      status: 409,
      code: "promotion_requirements_failed",
    });
  }
  if (input.revision !== repository.latestRevision) {
    throw Object.assign(new Error("only the latest immutable revision can be promoted"), {
      status: 409,
      code: "promotion_requirements_failed",
    });
  }
  const runtimeModel = findModel(input.runtime_model_id);
  if (!runtimeModel || !isModelExecutionReady(runtimeModel)) {
    throw Object.assign(new Error("runtime_model_id must reference an executable, price-verified catalog model"), {
      status: 409,
      code: "promotion_requirements_failed",
    });
  }
  const revision = await findRepositoryRevision(db, repository.id, input.revision);
  const [pending] = await db
    .select()
    .from(schema.hubModelPromotionRequests)
    .where(
      and(
        eq(schema.hubModelPromotionRequests.repositoryId, repository.id),
        eq(schema.hubModelPromotionRequests.revisionId, revision.id),
        eq(schema.hubModelPromotionRequests.status, "pending"),
      ),
    )
    .limit(1);
  if (pending) {
    if (pending.runtimeModelId === input.runtime_model_id) return publicPromotion(pending);
    throw Object.assign(new Error("this revision already has a pending promotion request"), {
      status: 409,
      code: "conflict",
    });
  }
  const row = {
    id: id("mdlprom"),
    repositoryId: repository.id,
    revisionId: revision.id,
    runtimeModelId: input.runtime_model_id,
    status: "pending",
    requestedBy: auth.userId,
  };
  try {
    await withTransaction(async (tx) => {
      await tx.insert(schema.hubModelPromotionRequests).values(row);
      await tx
        .update(schema.hubRepositories)
        .set({ verificationStatus: "pending", updatedAt: new Date() })
        .where(eq(schema.hubRepositories.id, repository.id));
    });
  } catch (error) {
    if (!/unique|duplicate/i.test(error instanceof Error ? error.message : "")) throw error;
    const [raced] = await db
      .select()
      .from(schema.hubModelPromotionRequests)
      .where(
        and(
          eq(schema.hubModelPromotionRequests.repositoryId, repository.id),
          eq(schema.hubModelPromotionRequests.revisionId, revision.id),
          eq(schema.hubModelPromotionRequests.status, "pending"),
        ),
      )
      .limit(1);
    if (raced?.runtimeModelId === input.runtime_model_id) return publicPromotion(raced);
    throw Object.assign(new Error("this revision already has a pending promotion request"), {
      status: 409,
      code: "conflict",
    });
  }
  const [created] = await db
    .select()
    .from(schema.hubModelPromotionRequests)
    .where(eq(schema.hubModelPromotionRequests.id, row.id))
    .limit(1);
  return publicPromotion(created);
}

export async function listPendingModelGovernance() {
  const evaluations = await db
    .select({
      evaluation: schema.hubModelEvaluations,
      revision: schema.hubRevisions,
      repository: schema.hubRepositories,
      namespace: schema.hubNamespaces,
    })
    .from(schema.hubModelEvaluations)
    .innerJoin(schema.hubRevisions, eq(schema.hubRevisions.id, schema.hubModelEvaluations.revisionId))
    .innerJoin(schema.hubRepositories, eq(schema.hubRepositories.id, schema.hubModelEvaluations.repositoryId))
    .innerJoin(schema.hubNamespaces, eq(schema.hubNamespaces.id, schema.hubRepositories.namespaceId))
    .where(eq(schema.hubModelEvaluations.status, "submitted"))
    .orderBy(schema.hubModelEvaluations.createdAt)
    .limit(100);
  const promotions = await db
    .select({
      promotion: schema.hubModelPromotionRequests,
      revision: schema.hubRevisions,
      repository: schema.hubRepositories,
      namespace: schema.hubNamespaces,
    })
    .from(schema.hubModelPromotionRequests)
    .innerJoin(schema.hubRevisions, eq(schema.hubRevisions.id, schema.hubModelPromotionRequests.revisionId))
    .innerJoin(schema.hubRepositories, eq(schema.hubRepositories.id, schema.hubModelPromotionRequests.repositoryId))
    .innerJoin(schema.hubNamespaces, eq(schema.hubNamespaces.id, schema.hubRepositories.namespaceId))
    .where(eq(schema.hubModelPromotionRequests.status, "pending"))
    .orderBy(schema.hubModelPromotionRequests.createdAt)
    .limit(100);
  return {
    evaluations: evaluations.map((row) => ({
      ...publicEvaluation(row.evaluation, row.revision.revision),
      revision: row.revision.revision,
      commit_sha: row.revision.commitSha,
      repository_path: `${row.namespace.slug}/${row.repository.slug}`,
      repository_title: row.repository.title,
    })),
    promotions: promotions.map((row) => ({
      ...publicPromotion(row.promotion),
      revision: row.revision.revision,
      commit_sha: row.revision.commitSha,
      repository_path: `${row.namespace.slug}/${row.repository.slug}`,
      repository_title: row.repository.title,
    })),
  };
}

export async function reviewModelEvaluation(input: {
  evaluationId: string;
  actorUserId: string;
  decision: "approved" | "rejected";
  note: string;
}) {
  return withTransaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM hub_model_evaluation WHERE id = ${input.evaluationId} FOR UPDATE`);
    const [row] = await tx
      .select({ evaluation: schema.hubModelEvaluations, revision: schema.hubRevisions.revision })
      .from(schema.hubModelEvaluations)
      .innerJoin(schema.hubRevisions, eq(schema.hubRevisions.id, schema.hubModelEvaluations.revisionId))
      .where(eq(schema.hubModelEvaluations.id, input.evaluationId))
      .limit(1);
    const evaluation = row?.evaluation;
    if (!evaluation) throw Object.assign(new Error("evaluation not found"), { status: 404, code: "not_found" });
    if (evaluation.status !== "submitted") {
      throw Object.assign(new Error("evaluation was already reviewed"), { status: 409, code: "conflict" });
    }
    const status = input.decision === "approved" ? "verified" : "rejected";
    const reviewedAt = new Date();
    await tx
      .update(schema.hubModelEvaluations)
      .set({ status, reviewedBy: input.actorUserId, reviewNote: input.note, reviewedAt })
      .where(eq(schema.hubModelEvaluations.id, evaluation.id));
    return publicEvaluation(
      { ...evaluation, status, reviewedBy: input.actorUserId, reviewNote: input.note, reviewedAt },
      row.revision,
    );
  });
}

async function promotionEvidence(
  tx: DbExecutor,
  repository: ModelRepository,
  revision: Revision,
  runtimeModelId: string,
) {
  const artifacts = await tx
    .select({
      path: schema.hubRevisionFiles.path,
      status: schema.files.status,
      checksumSha256: schema.files.checksumSha256,
    })
    .from(schema.hubRevisionFiles)
    .innerJoin(schema.files, eq(schema.files.id, schema.hubRevisionFiles.fileId))
    .where(eq(schema.hubRevisionFiles.revisionId, revision.id));
  const verifiedEvaluations = await tx
    .select({ id: schema.hubModelEvaluations.id })
    .from(schema.hubModelEvaluations)
    .where(
      and(
        eq(schema.hubModelEvaluations.revisionId, revision.id),
        eq(schema.hubModelEvaluations.status, "verified"),
      ),
    );
  const runtimeModel = findModel(runtimeModelId);
  return buildPromotionChecklist({
    repository,
    revision,
    artifacts,
    verifiedEvaluationCount: verifiedEvaluations.length,
    runtimeReady: Boolean(runtimeModel && isModelExecutionReady(runtimeModel)),
  });
}

export async function reviewModelPromotion(input: {
  promotionId: string;
  actorUserId: string;
  decision: "approved" | "rejected";
  note: string;
}) {
  return withTransaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM hub_model_promotion_request WHERE id = ${input.promotionId} FOR UPDATE`);
    const [row] = await tx
      .select({
        promotion: schema.hubModelPromotionRequests,
        revision: schema.hubRevisions,
        repository: schema.hubRepositories,
        namespace: schema.hubNamespaces,
      })
      .from(schema.hubModelPromotionRequests)
      .innerJoin(schema.hubRevisions, eq(schema.hubRevisions.id, schema.hubModelPromotionRequests.revisionId))
      .innerJoin(schema.hubRepositories, eq(schema.hubRepositories.id, schema.hubModelPromotionRequests.repositoryId))
      .innerJoin(schema.hubNamespaces, eq(schema.hubNamespaces.id, schema.hubRepositories.namespaceId))
      .where(eq(schema.hubModelPromotionRequests.id, input.promotionId))
      .limit(1);
    if (!row) throw Object.assign(new Error("promotion request not found"), { status: 404, code: "not_found" });
    if (row.promotion.status !== "pending") {
      throw Object.assign(new Error("promotion request was already reviewed"), { status: 409, code: "conflict" });
    }
    const repository: ModelRepository = {
      ...row.repository,
      namespace: row.namespace.slug,
      namespaceDisplayName: row.namespace.displayName,
      namespaceVerified: row.namespace.verified,
    };
    const checklist = await promotionEvidence(tx, repository, row.revision, row.promotion.runtimeModelId);
    const reviewedAt = new Date();
    if (input.decision === "approved") {
      const failed = Object.entries(checklist).filter(([, passed]) => !passed).map(([name]) => name);
      if (failed.length) {
        throw Object.assign(new Error(`promotion requirements failed: ${failed.join(", ")}`), {
          status: 409,
          code: "promotion_requirements_failed",
        });
      }
      await tx
        .update(schema.hubModelPromotionRequests)
        .set({
          status: "approved",
          reviewedBy: input.actorUserId,
          reviewNote: input.note,
          checklist,
          reviewedAt,
        })
        .where(eq(schema.hubModelPromotionRequests.id, row.promotion.id));
      await tx
        .update(schema.hubRepositories)
        .set({
          verificationStatus: "verified",
          verifiedRevision: row.revision.revision,
          runtimeModelId: row.promotion.runtimeModelId,
          verifiedAt: reviewedAt,
          verifiedBy: input.actorUserId,
          updatedAt: reviewedAt,
        })
        .where(eq(schema.hubRepositories.id, repository.id));
      return { ...publicPromotion(row.promotion), status: "approved", checklist, review_note: input.note, reviewed_at: reviewedAt };
    }
    await tx
      .update(schema.hubModelPromotionRequests)
      .set({
        status: "rejected",
        reviewedBy: input.actorUserId,
        reviewNote: input.note,
        checklist,
        reviewedAt,
      })
      .where(eq(schema.hubModelPromotionRequests.id, row.promotion.id));
    if (repository.latestRevision === row.revision.revision && repository.verificationStatus === "pending") {
      await tx
        .update(schema.hubRepositories)
        .set({ verificationStatus: "rejected", updatedAt: reviewedAt })
        .where(eq(schema.hubRepositories.id, repository.id));
    }
    return { ...publicPromotion(row.promotion), status: "rejected", checklist, review_note: input.note, reviewed_at: reviewedAt };
  });
}
