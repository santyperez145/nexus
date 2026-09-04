import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { multipartUploadParts, signMultipartParts } from "@/lib/files/store";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { canAccess, canMutateResource } from "@/lib/gateway/tenant";

type Context = { params: Promise<{ id: string }> };

const partsSchema = z.object({
  parts: z
    .array(
      z.object({
        part_number: z.number().int().min(1).max(10_000),
        sha256: z.string().regex(/^[a-f0-9]{64}$/i),
      }),
    )
    .min(1)
    .max(16),
});

async function authorizedUpload(req: Request, id: string) {
  const auth = await authenticateRequest(req);
  const [row] = await db.select().from(schema.files).where(eq(schema.files.id, id)).limit(1);
  if (!row || !canAccess(auth, row) || !(await canMutateResource(auth, row))) {
    throw Object.assign(new Error("Upload not found"), { status: 404, code: "not_found" });
  }
  return row;
}

export async function GET(req: Request, { params }: Context) {
  try {
    const { id } = await params;
    const row = await authorizedUpload(req, id);
    const parts = await multipartUploadParts(row);
    return Response.json({
      data: parts.map((part) => ({
        part_number: part.partNumber,
        bytes: part.size,
        sha256_base64: part.checksumSha256,
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request, { params }: Context) {
  try {
    const { id } = await params;
    const row = await authorizedUpload(req, id);
    const parsed = partsSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw Object.assign(new Error(parsed.error.issues[0]?.message ?? "Invalid multipart request"), {
        status: 400,
        code: "invalid_request",
      });
    }
    const parts = await signMultipartParts(
      row,
      parsed.data.parts.map((part) => ({
        partNumber: part.part_number,
        checksumSha256: part.sha256,
      })),
    );
    return Response.json({
      data: parts.map((part) => ({
        part_number: part.partNumber,
        bytes: part.size,
        sha256: part.checksumSha256,
        method: "PUT",
        url: part.url,
        headers: part.headers,
        expires_in: part.expiresIn,
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}
