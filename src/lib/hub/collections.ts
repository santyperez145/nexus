import { z } from "zod";

export const collectionThemes = ["indigo", "cyan", "amber", "emerald", "rose", "zinc"] as const;
export const collectionItemTypes = ["model", "dataset", "space"] as const;

export const createCollectionSchema = z.object({
  namespace: z.string().trim().min(1).max(100),
  slug: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(5_000).optional().default(""),
  visibility: z.enum(["public", "private"]).optional().default("public"),
  theme: z.enum(collectionThemes).optional().default("indigo"),
  workspace_id: z.string().trim().min(1).max(160).nullable().optional(),
});

export const updateCollectionSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(5_000).optional(),
    visibility: z.enum(["public", "private"]).optional(),
    theme: z.enum(collectionThemes).optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), "empty update");

export const addCollectionItemSchema = z.object({
  type: z.enum(collectionItemTypes),
  path: z.string().trim().min(3).max(240),
  note: z.string().trim().max(500).optional().default(""),
});

export const updateCollectionItemSchema = z.object({
  id: z.string().trim().min(1).max(180),
  note: z.string().trim().max(500),
});

export const reorderCollectionItemsSchema = z.object({
  item_ids: z.array(z.string().trim().min(1).max(180)).max(100),
});

export function normalizeCollectionItemPath(value: string) {
  const path = value.trim();
  const parts = path.split("/");
  if (
    parts.length !== 2 ||
    parts.some((part) => !part || part.length > 180) ||
    /[\u0000-\u001f\u007f?#\\]/.test(path)
  ) {
    throw Object.assign(new Error("collection item path must be namespace/slug"), {
      status: 400,
      code: "invalid_request",
    });
  }
  return path;
}

export function invalidCollectionInput(error: z.ZodError) {
  return Object.assign(new Error(error.issues[0]?.message ?? "invalid collection request"), {
    status: 400,
    code: "invalid_request",
  });
}
