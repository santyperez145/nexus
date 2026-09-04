import { z } from "zod";
import type { AuthContext } from "@/lib/gateway/types";
import { slugify } from "@/lib/slug";

const boundedText = (max: number) => z.string().trim().max(max);
const metadataSchema = z
  .record(z.string().max(120), z.unknown())
  .refine((value) => JSON.stringify(value).length <= 64_000, "metadata is too large");

export const createDatasetSchema = z.object({
  namespace: z.string().trim().min(1).max(100),
  slug: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(120),
  description: boundedText(5_000).optional().default(""),
  visibility: z.enum(["public", "private"]).optional().default("public"),
  gated: z.boolean().optional().default(false),
  license: z.string().trim().min(1).max(64).optional().default("other"),
  task: z.string().trim().min(1).max(64).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(48)).max(20).optional().default([]),
  workspace_id: z.string().trim().min(1).max(160).nullable().optional(),
});

export const updateDatasetSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    description: boundedText(5_000).optional(),
    visibility: z.enum(["public", "private"]).optional(),
    gated: z.boolean().optional(),
    license: z.string().trim().min(1).max(64).optional(),
    task: z.string().trim().min(1).max(64).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(48)).max(20).optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), "empty update");

export const createRevisionSchema = z.object({
  commit_message: z.string().trim().min(1).max(240),
  metadata: metadataSchema.optional().default({}),
  files: z
    .array(
      z.object({
        file_id: z.string().trim().min(1).max(180),
        path: z.string().trim().min(1).max(512),
      }),
    )
    .min(1)
    .max(100),
});

export const decideAccessSchema = z.object({
  id: z.string().trim().min(1).max(180),
  status: z.enum(["approved", "rejected"]),
});

export type DatasetRepositoryAccessRow = {
  userId: string;
  workspaceId?: string | null;
  visibility: string;
  gated: boolean;
};

export function hubTenantAccess(
  auth: Pick<AuthContext, "userId" | "workspaceId" | "workspaceIds"> | null,
  resource: { userId: string; workspaceId?: string | null },
) {
  if (!auth) return false;
  if (!resource.workspaceId) return !auth.workspaceId && resource.userId === auth.userId;
  if (auth.workspaceId) {
    return resource.workspaceId === auth.workspaceId && Boolean(auth.workspaceIds?.includes(auth.workspaceId));
  }
  return Boolean(auth.workspaceIds?.includes(resource.workspaceId));
}

export function hubSlug(value: string, fallback: string) {
  const normalized = slugify(value, fallback);
  if (normalized.length > 80) {
    throw Object.assign(new Error("namespace and slug must be at most 80 characters"), {
      status: 400,
      code: "invalid_request",
    });
  }
  return normalized;
}

export function normalizeTags(values: string[]) {
  return [...new Set(values.map((value) => hubSlug(value, "tag")))].slice(0, 20);
}

export function normalizeDatasetPath(value: string) {
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "");
  const parts = normalized.split("/");
  if (
    normalized.startsWith("/") ||
    normalized.endsWith("/") ||
    parts.some((part) => !part || part === "." || part === ".." || part.length > 180) ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw Object.assign(new Error(`invalid dataset path: ${value}`), {
      status: 400,
      code: "invalid_request",
    });
  }
  return normalized;
}

export function datasetMetadataVisible(
  repository: DatasetRepositoryAccessRow,
  auth: AuthContext | null,
  approvedGrant = false,
) {
  return (
    repository.visibility === "public" ||
    approvedGrant ||
    hubTenantAccess(auth, repository)
  );
}

export function datasetContentReadable(
  repository: DatasetRepositoryAccessRow,
  auth: AuthContext | null,
  approvedGrant = false,
) {
  if (hubTenantAccess(auth, repository)) return true;
  if (approvedGrant) return true;
  return repository.visibility === "public" && !repository.gated;
}

export function assertUniqueRevisionPaths(files: Array<{ path: string }>) {
  const seen = new Set<string>();
  for (const file of files) {
    const path = normalizeDatasetPath(file.path);
    if (seen.has(path)) {
      throw Object.assign(new Error(`duplicate dataset path: ${path}`), {
        status: 400,
        code: "invalid_request",
      });
    }
    seen.add(path);
  }
}

export function parseDatasetRevision(value: string, latest: number) {
  if (value === "main" || value === "latest") return latest;
  if (/^[a-f0-9]{12,64}$/i.test(value)) return value.toLowerCase();
  const revision = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw Object.assign(new Error("invalid dataset revision"), {
      status: 400,
      code: "invalid_request",
    });
  }
  return revision;
}

export function invalidDatasetInput(error: z.ZodError) {
  return Object.assign(new Error(error.issues[0]?.message ?? "invalid dataset request"), {
    status: 400,
    code: "invalid_request",
  });
}
