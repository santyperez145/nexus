import { createHash } from "node:crypto";
import { and, asc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { limitsForPlan } from "@/lib/config";
import { db, schema, withTransaction, type DbExecutor } from "@/lib/db";
import { resolveOwnedWorkspace } from "@/lib/gateway/tenant";
import type { AuthContext } from "@/lib/gateway/types";
import { id } from "@/lib/ids";
import {
  abortMultipartArtifactUpload,
  artifactObjectKey,
  completeMultipartArtifactUpload,
  createMultipartArtifactUpload,
  deleteArtifact,
  listMultipartArtifactParts,
  objectStorageEnabled,
  putArtifact,
  signArtifactUpload,
  signMultipartArtifactPart,
  verifyArtifact,
} from "./blob-store";

export const INLINE_FILE_MAX_BYTES = 8_000_000;
export const MULTIPART_UPLOAD_THRESHOLD_BYTES = 100 * 1024 ** 2;
export const MULTIPART_PART_BYTES = 64 * 1024 ** 2;
export const DIRECT_UPLOAD_MAX_BYTES = 50 * 1024 ** 3;
export const DIRECT_UPLOAD_TTL_MS = 15 * 60 * 1000;
export const MULTIPART_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_PART_SIGNATURES_PER_REQUEST = 16;

type FileInsert = typeof schema.files.$inferInsert;

function requestError(message: string, status = 400, code = "invalid_request") {
  return Object.assign(new Error(message), { status, code });
}

export function normalizeArtifactFilename(value: string) {
  const filename = value.trim();
  if (!filename || filename.length > 512 || /[\u0000-\u001f\u007f]/.test(filename)) {
    throw requestError("Artifact filename is invalid");
  }
  return filename;
}

export function normalizeArtifactMime(value: string) {
  const mime = value.trim() || "application/octet-stream";
  if (mime.length > 255 || /[\r\n]/.test(mime)) throw requestError("Artifact MIME type is invalid");
  return mime;
}

function exactScope(userId: string, workspaceId: string | null) {
  return workspaceId
    ? eq(schema.files.workspaceId, workspaceId)
    : and(eq(schema.files.userId, userId), isNull(schema.files.workspaceId));
}

async function scopePlan(executor: DbExecutor, auth: AuthContext, workspaceId: string | null) {
  if (!workspaceId) return auth.plan;
  const [owner] = await executor
    .select({ plan: schema.users.plan })
    .from(schema.workspaces)
    .innerJoin(schema.users, eq(schema.users.id, schema.workspaces.userId))
    .where(eq(schema.workspaces.id, workspaceId))
    .limit(1);
  if (!owner) throw requestError("Workspace not found", 404, "not_found");
  return owner.plan;
}

async function usedBytes(executor: DbExecutor, userId: string, workspaceId: string | null) {
  const [usage] = await executor
    .select({ value: sql<string>`coalesce(sum(${schema.files.size}), 0)::text` })
    .from(schema.files)
    .where(
      and(
        exactScope(userId, workspaceId),
        or(
          eq(schema.files.status, "ready"),
          and(
            inArray(schema.files.status, ["pending", "completing"]),
            gt(schema.files.uploadExpiresAt, new Date()),
          ),
        ),
      ),
    );
  return Number(usage?.value ?? 0);
}

export async function resolveFileTarget(auth: AuthContext, requestedWorkspace: unknown) {
  const workspaceId = await resolveOwnedWorkspace(auth, requestedWorkspace);
  const plan = await scopePlan(db, auth, workspaceId);
  return { workspaceId, plan };
}

export async function storageUsage(auth: AuthContext, requestedWorkspace?: unknown) {
  const { workspaceId, plan } = await resolveFileTarget(auth, requestedWorkspace);
  const used = await usedBytes(db, auth.userId, workspaceId);
  return {
    usedBytes: used,
    quotaBytes: limitsForPlan(plan).storageBytes,
    workspaceId,
    directUpload: objectStorageEnabled(),
    inlineMaxBytes: INLINE_FILE_MAX_BYTES,
    directMaxBytes: DIRECT_UPLOAD_MAX_BYTES,
  };
}

async function reserveRow(
  auth: AuthContext,
  workspaceId: string | null,
  size: number,
  row: Omit<FileInsert, "userId" | "workspaceId" | "size">,
) {
  return withTransaction(async (tx) => {
    if (workspaceId) {
      await tx.execute(sql`SELECT id FROM workspace WHERE id = ${workspaceId} FOR UPDATE`);
    } else {
      await tx.execute(sql`SELECT id FROM "user" WHERE id = ${auth.userId} FOR UPDATE`);
    }
    const plan = await scopePlan(tx, auth, workspaceId);
    const used = await usedBytes(tx, auth.userId, workspaceId);
    const quota = limitsForPlan(plan).storageBytes;
    if (used + size > quota) {
      throw requestError(
        `Artifact storage quota exceeded (${used + size} requested of ${quota} bytes)`,
        413,
        "storage_quota_exceeded",
      );
    }
    const complete = { ...row, userId: auth.userId, workspaceId, size };
    const [created] = await tx.insert(schema.files).values(complete).returning();
    if (!created) throw new Error("Artifact reservation was not persisted");
    return created;
  });
}

export async function createInlineFile(
  auth: AuthContext,
  input: { filename: string; mime: string; bytes: Uint8Array; workspaceId: string | null },
) {
  input.filename = normalizeArtifactFilename(input.filename);
  input.mime = normalizeArtifactMime(input.mime);
  if (input.bytes.byteLength > INLINE_FILE_MAX_BYTES) {
    throw requestError("File too large for multipart upload; use the direct artifact upload API", 413);
  }
  const fileId = id("file");
  const checksumSha256 = createHash("sha256").update(input.bytes).digest("hex");
  if (!objectStorageEnabled()) {
    return reserveRow(auth, input.workspaceId, input.bytes.byteLength, {
      id: fileId,
      filename: input.filename,
      mime: input.mime,
      content: Buffer.from(input.bytes).toString("base64"),
      storageBackend: "database",
      storageKey: null,
      checksumSha256,
      etag: null,
      status: "ready",
      uploadExpiresAt: null,
    });
  }
  const storageKey = artifactObjectKey({ fileId, userId: auth.userId, workspaceId: input.workspaceId });
  const reserved = await reserveRow(auth, input.workspaceId, input.bytes.byteLength, {
    id: fileId,
    filename: input.filename,
    mime: input.mime,
    content: null,
    storageBackend: "s3",
    storageKey,
    checksumSha256,
    etag: null,
    status: "pending",
    uploadExpiresAt: new Date(Date.now() + DIRECT_UPLOAD_TTL_MS),
  });
  try {
    const { etag } = await putArtifact({
      key: storageKey,
      mime: input.mime,
      body: input.bytes,
      checksumSha256,
    });
    await db
      .update(schema.files)
      .set({ status: "ready", etag, uploadExpiresAt: null, updatedAt: new Date() })
      .where(eq(schema.files.id, fileId));
    return { ...reserved, status: "ready", etag, uploadExpiresAt: null };
  } catch (error) {
    await db
      .update(schema.files)
      .set({ status: "failed", uploadExpiresAt: null, updatedAt: new Date() })
      .where(eq(schema.files.id, fileId));
    throw error;
  }
}

export async function initiateDirectUpload(
  auth: AuthContext,
  input: {
    filename: string;
    mime: string;
    size: number;
    checksumSha256: string;
    workspaceId: string | null;
  },
) {
  input.filename = normalizeArtifactFilename(input.filename);
  input.mime = normalizeArtifactMime(input.mime);
  if (!objectStorageEnabled()) {
    throw requestError("Object storage is not configured for large artifacts", 503, "object_storage_unavailable");
  }
  if (!Number.isSafeInteger(input.size) || input.size <= 0 || input.size > DIRECT_UPLOAD_MAX_BYTES) {
    throw requestError(`Artifact size must be between 1 and ${DIRECT_UPLOAD_MAX_BYTES} bytes`, 413);
  }
  const fileId = id("file");
  const storageKey = artifactObjectKey({ fileId, userId: auth.userId, workspaceId: input.workspaceId });
  const useMultipart = input.size > MULTIPART_UPLOAD_THRESHOLD_BYTES;
  const expiresAt = new Date(
    Date.now() + (useMultipart ? MULTIPART_UPLOAD_TTL_MS : DIRECT_UPLOAD_TTL_MS),
  );
  let row = await reserveRow(auth, input.workspaceId, input.size, {
    id: fileId,
    filename: input.filename,
    mime: input.mime,
    content: null,
    storageBackend: "s3",
    storageKey,
    checksumSha256: input.checksumSha256.toLowerCase(),
    etag: null,
    status: "pending",
    uploadExpiresAt: expiresAt,
  });
  try {
    if (useMultipart) {
      const multipart = await createMultipartArtifactUpload({
        key: storageKey,
        mime: input.mime,
        checksumSha256: input.checksumSha256,
      });
      const [updated] = await db
        .update(schema.files)
        .set({
          storageUploadId: multipart.uploadId,
          storagePartSize: MULTIPART_PART_BYTES,
          updatedAt: new Date(),
        })
        .where(and(eq(schema.files.id, fileId), eq(schema.files.status, "pending")))
        .returning();
      if (!updated) {
        await abortMultipartArtifactUpload({ key: storageKey, uploadId: multipart.uploadId }).catch(
          () => undefined,
        );
        throw requestError("Artifact reservation changed during multipart setup", 409, "invalid_upload_state");
      }
      row = updated;
      return {
        row,
        upload: {
          strategy: "multipart" as const,
          partSize: MULTIPART_PART_BYTES,
          partCount: Math.ceil(input.size / MULTIPART_PART_BYTES),
        },
        expiresAt,
      };
    }
    const signed = await signArtifactUpload({
      key: storageKey,
      mime: input.mime,
      size: input.size,
      checksumSha256: input.checksumSha256,
    });
    return {
      row,
      upload: { strategy: "single" as const, ...signed },
      expiresAt,
    };
  } catch (error) {
    await db
      .update(schema.files)
      .set({ status: "failed", uploadExpiresAt: null, updatedAt: new Date() })
      .where(eq(schema.files.id, fileId));
    throw error;
  }
}

function activeMultipart(row: typeof schema.files.$inferSelect) {
  if (
    row.status !== "pending" ||
    row.storageBackend !== "s3" ||
    !row.storageKey ||
    !row.storageUploadId ||
    !row.storagePartSize ||
    !row.checksumSha256
  ) {
    throw requestError("Multipart upload is not active", 409, "invalid_upload_state");
  }
  if (!row.uploadExpiresAt || row.uploadExpiresAt.getTime() <= Date.now()) {
    throw requestError("Artifact upload reservation expired", 410, "upload_expired");
  }
  return {
    key: row.storageKey,
    uploadId: row.storageUploadId,
    partSize: row.storagePartSize,
    partCount: Math.ceil(row.size / row.storagePartSize),
    checksumSha256: row.checksumSha256,
  };
}

export async function signMultipartParts(
  row: typeof schema.files.$inferSelect,
  requested: Array<{ partNumber: number; checksumSha256: string }>,
) {
  const upload = activeMultipart(row);
  if (!requested.length || requested.length > MAX_PART_SIGNATURES_PER_REQUEST) {
    throw requestError(
      `Request between 1 and ${MAX_PART_SIGNATURES_PER_REQUEST} multipart signatures`,
    );
  }
  const unique = new Set(requested.map((part) => part.partNumber));
  if (unique.size !== requested.length) throw requestError("Multipart part numbers must be unique");
  return Promise.all(
    requested.map(async (part) => {
      if (!Number.isInteger(part.partNumber) || part.partNumber < 1 || part.partNumber > upload.partCount) {
        throw requestError("Multipart part number is outside the reservation");
      }
      const offset = (part.partNumber - 1) * upload.partSize;
      const size = Math.min(upload.partSize, row.size - offset);
      const signed = await signMultipartArtifactPart({
        key: upload.key,
        uploadId: upload.uploadId,
        partNumber: part.partNumber,
        size,
        checksumSha256: part.checksumSha256,
      });
      return {
        partNumber: part.partNumber,
        size,
        checksumSha256: part.checksumSha256.toLowerCase(),
        ...signed,
      };
    }),
  );
}

export async function multipartUploadParts(row: typeof schema.files.$inferSelect) {
  const upload = activeMultipart(row);
  return listMultipartArtifactParts({ key: upload.key, uploadId: upload.uploadId });
}

function validateCompleteParts(
  row: typeof schema.files.$inferSelect,
  parts: Awaited<ReturnType<typeof listMultipartArtifactParts>>,
) {
  if (!row.storagePartSize) throw requestError("Multipart upload has no part size", 409);
  const expectedCount = Math.ceil(row.size / row.storagePartSize);
  if (parts.length !== expectedCount) {
    throw requestError(
      `Multipart upload is incomplete (${parts.length}/${expectedCount} parts)`,
      409,
      "upload_incomplete",
    );
  }
  let total = 0;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const expectedNumber = index + 1;
    const expectedSize = Math.min(row.storagePartSize, row.size - index * row.storagePartSize);
    if (part.partNumber !== expectedNumber || part.size !== expectedSize) {
      throw requestError("Multipart upload parts do not match the reservation", 409, "upload_incomplete");
    }
    total += part.size;
  }
  if (total !== row.size) throw requestError("Multipart upload size is incomplete", 409, "upload_incomplete");
  return parts;
}

async function failMultipart(row: typeof schema.files.$inferSelect) {
  if (row.storageKey && row.storageUploadId) {
    await abortMultipartArtifactUpload({ key: row.storageKey, uploadId: row.storageUploadId }).catch(
      () => undefined,
    );
  }
  if (row.storageKey) await deleteArtifact(row.storageKey).catch(() => undefined);
  await db
    .update(schema.files)
    .set({ status: "failed", uploadExpiresAt: null, updatedAt: new Date() })
    .where(and(eq(schema.files.id, row.id), inArray(schema.files.status, ["pending", "completing"])));
}

async function completeMultipart(row: typeof schema.files.$inferSelect) {
  const upload = activeMultipart(row);
  const parts = validateCompleteParts(
    row,
    await listMultipartArtifactParts({ key: upload.key, uploadId: upload.uploadId }),
  );
  const [claimed] = await db
    .update(schema.files)
    .set({ status: "completing", updatedAt: new Date() })
    .where(and(eq(schema.files.id, row.id), eq(schema.files.status, "pending")))
    .returning();
  if (!claimed) {
    const [current] = await db.select().from(schema.files).where(eq(schema.files.id, row.id)).limit(1);
    if (current?.status === "ready") return current;
    throw requestError("Multipart completion is already in progress", 409, "completion_in_progress");
  }
  try {
    const completed = await completeMultipartArtifactUpload({
      key: upload.key,
      uploadId: upload.uploadId,
      parts,
    });
    const verified = await verifyArtifact({
      key: upload.key,
      size: row.size,
      checksumSha256: upload.checksumSha256,
      multipartChecksumSha256: completed.checksumSha256,
    });
    const [ready] = await db
      .update(schema.files)
      .set({ status: "ready", etag: verified.etag ?? completed.etag, uploadExpiresAt: null, updatedAt: new Date() })
      .where(and(eq(schema.files.id, row.id), eq(schema.files.status, "completing")))
      .returning();
    if (!ready) throw requestError("Multipart completion state changed", 409, "invalid_upload_state");
    return ready;
  } catch (error) {
    await failMultipart(claimed);
    throw error;
  }
}

export async function completeDirectUpload(row: typeof schema.files.$inferSelect) {
  if (row.status === "ready") return row;
  if (row.storageUploadId && row.storagePartSize) return completeMultipart(row);
  if (row.status !== "pending" || row.storageBackend !== "s3" || !row.storageKey || !row.checksumSha256) {
    throw requestError("Artifact upload is not completable", 409, "invalid_upload_state");
  }
  if (!row.uploadExpiresAt || row.uploadExpiresAt.getTime() <= Date.now()) {
    await db
      .update(schema.files)
      .set({ status: "failed", uploadExpiresAt: null, updatedAt: new Date() })
      .where(eq(schema.files.id, row.id));
    if (row.storageKey) await deleteArtifact(row.storageKey).catch(() => undefined);
    throw requestError("Artifact upload reservation expired", 410, "upload_expired");
  }
  let verified: Awaited<ReturnType<typeof verifyArtifact>>;
  try {
    verified = await verifyArtifact({
      key: row.storageKey,
      size: row.size,
      checksumSha256: row.checksumSha256,
    });
  } catch (error) {
    await deleteArtifact(row.storageKey).catch(() => undefined);
    await db
      .update(schema.files)
      .set({ status: "failed", uploadExpiresAt: null, updatedAt: new Date() })
      .where(and(eq(schema.files.id, row.id), eq(schema.files.status, "pending")));
    throw error;
  }
  const [ready] = await db
    .update(schema.files)
    .set({ status: "ready", etag: verified.etag, uploadExpiresAt: null, updatedAt: new Date() })
    .where(and(eq(schema.files.id, row.id), eq(schema.files.status, "pending")))
    .returning();
  if (ready) return ready;
  const [current] = await db.select().from(schema.files).where(eq(schema.files.id, row.id)).limit(1);
  if (current?.status === "ready") return current;
  throw requestError("Artifact upload state changed before completion", 409, "invalid_upload_state");
}

export function publicFile(row: typeof schema.files.$inferSelect) {
  return {
    id: row.id,
    filename: row.filename,
    bytes: row.size,
    mime: row.mime,
    purpose: "assistants",
    status: row.status,
    storage_backend: row.storageBackend,
    upload_strategy: row.storagePartSize ? "multipart" : row.storageBackend === "s3" ? "single" : "inline",
    sha256: row.checksumSha256,
    created_at: row.createdAt,
  };
}

export async function cleanupExpiredArtifactUploads(limit = 100) {
  const expired = await db
    .select()
    .from(schema.files)
    .where(
      and(
        inArray(schema.files.status, ["pending", "completing"]),
        eq(schema.files.storageBackend, "s3"),
        lt(schema.files.uploadExpiresAt, new Date()),
      ),
    )
    .orderBy(asc(schema.files.uploadExpiresAt))
    .limit(Math.max(1, Math.min(500, limit)));
  let cleaned = 0;
  let failed = 0;
  for (const row of expired) {
    if (!row.storageKey) continue;
    try {
      if (row.storageUploadId) {
        await abortMultipartArtifactUpload({ key: row.storageKey, uploadId: row.storageUploadId }).catch(
          () => undefined,
        );
      }
      await deleteArtifact(row.storageKey);
      const updated = await db
        .update(schema.files)
        .set({ status: "failed", uploadExpiresAt: null, updatedAt: new Date() })
        .where(and(eq(schema.files.id, row.id), inArray(schema.files.status, ["pending", "completing"])))
        .returning();
      if (updated.length) cleaned += 1;
    } catch {
      failed += 1;
    }
  }
  return { claimed: expired.length, cleaned, failed };
}
