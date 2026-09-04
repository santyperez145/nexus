import { z } from "zod";
import {
  decideAccessSchema,
  hubSlug,
  invalidDatasetInput,
  normalizeDatasetPath,
  normalizeTags,
  parseDatasetRevision,
} from "./datasets";

const boundedText = (max: number) => z.string().trim().max(max);
const metadataSchema = z
  .record(z.string().max(120), z.unknown())
  .refine((value) => JSON.stringify(value).length <= 64_000, "metadata is too large");

export const createModelRepositorySchema = z.object({
  namespace: z.string().trim().min(1).max(100),
  slug: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(120),
  description: boundedText(5_000).optional().default(""),
  model_card: boundedText(64_000).optional().default(""),
  visibility: z.enum(["public", "private"]).optional().default("public"),
  gated: z.boolean().optional().default(false),
  license: z.string().trim().min(1).max(64).optional().default("other"),
  pipeline_tag: z.string().trim().min(1).max(64).nullable().optional(),
  library_name: z.string().trim().min(1).max(64).nullable().optional(),
  base_model: z.string().trim().min(1).max(180).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(48)).max(20).optional().default([]),
  workspace_id: z.string().trim().min(1).max(160).nullable().optional(),
});

export const updateModelRepositorySchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    description: boundedText(5_000).optional(),
    model_card: boundedText(64_000).optional(),
    visibility: z.enum(["public", "private"]).optional(),
    gated: z.boolean().optional(),
    license: z.string().trim().min(1).max(64).optional(),
    pipeline_tag: z.string().trim().min(1).max(64).nullable().optional(),
    library_name: z.string().trim().min(1).max(64).nullable().optional(),
    base_model: z.string().trim().min(1).max(180).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(48)).max(20).optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), "empty update");

export const createModelRevisionSchema = z.object({
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

export function modelRepositoryModalities(pipelineTag: string | null) {
  const pipeline = pipelineTag?.toLowerCase() ?? "";
  if (pipeline === "text-to-image") return { input: ["text"], output: ["image"] };
  if (pipeline === "image-to-image") return { input: ["image"], output: ["image"] };
  if (pipeline === "text-to-video") return { input: ["text"], output: ["video"] };
  if (pipeline === "image-to-video") return { input: ["image"], output: ["video"] };
  if (pipeline === "text-to-speech") return { input: ["text"], output: ["audio"] };
  if (pipeline === "automatic-speech-recognition") return { input: ["audio"], output: ["text"] };
  if (pipeline === "feature-extraction" || pipeline === "sentence-similarity") {
    return { input: ["text"], output: ["embeddings"] };
  }
  return { input: ["text"], output: ["text"] };
}

export {
  decideAccessSchema,
  hubSlug,
  invalidDatasetInput as invalidModelRepositoryInput,
  normalizeDatasetPath as normalizeModelPath,
  normalizeTags,
  parseDatasetRevision as parseModelRevision,
};
