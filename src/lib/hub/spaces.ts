import { z } from "zod";

const visibility = z.enum(["public", "private"]);

export const createSpaceSchema = z.object({
  namespace: z.string().trim().min(1).max(100),
  slug: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(5_000).optional().default(""),
  visibility: visibility.optional().default("public"),
  model: z.string().trim().min(1).max(180).optional().default("nexus/auto"),
  system_prompt: z.string().trim().max(32_000).optional().default(""),
  starter_prompt: z.string().trim().max(4_000).nullable().optional(),
  temperature: z.number().min(0).max(2).optional().default(0.7),
  max_tokens: z.number().int().min(1).max(131_072).optional().default(1_024),
  workspace_id: z.string().trim().min(1).max(160).nullable().optional(),
});

export const updateSpaceSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(5_000).optional(),
    visibility: visibility.optional(),
    model: z.string().trim().min(1).max(180).optional(),
    system_prompt: z.string().trim().max(32_000).optional(),
    starter_prompt: z.string().trim().max(4_000).nullable().optional(),
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().int().min(1).max(131_072).optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), "empty update");

const runMessage = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(128_000),
});

export const runSpaceSchema = z
  .object({
    prompt: z.string().min(1).max(128_000).optional(),
    messages: z.array(runMessage).min(1).max(64).optional(),
  })
  .refine((value) => Boolean(value.prompt || value.messages?.length), "prompt or messages is required");

export function invalidSpaceInput(error: z.ZodError) {
  return Object.assign(new Error(error.issues[0]?.message ?? "invalid space request"), {
    status: 400,
    code: "invalid_request",
  });
}

