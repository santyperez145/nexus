import { and, eq, gt } from "drizzle-orm";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { sha256, randomKey } from "@/lib/crypto";
import { db, ensureDb, schema, withTransaction } from "@/lib/db";
import { id } from "@/lib/ids";
import { KEY_PREFIX } from "@/lib/config";
import { defaultScopes } from "@/lib/gateway/acl";

/** Documenta el flujo PKCE (solo POST emite/canjea codes). */
export async function GET() {
  return Response.json({
    data: {
      flow: "pkce",
      steps: [
        "POST /api/v1/oauth with session + code_challenge → { code }",
        "POST /api/v1/oauth with code + code_verifier → { key: sk-nx-… }",
      ],
    },
  });
}

export async function POST(req: Request) {
  try {
    await ensureDb();
    const body = await req.json();
    if (body.code && body.code_verifier) {
      const challenge = sha256(body.code_verifier);
      const result = await withTransaction(async (tx) => {
        const [claimed] = await tx
          .update(schema.oauthCodes)
          .set({ used: true })
          .where(
            and(
              eq(schema.oauthCodes.codeHash, sha256(String(body.code))),
              eq(schema.oauthCodes.codeChallenge, challenge),
              eq(schema.oauthCodes.used, false),
              gt(schema.oauthCodes.expiresAt, new Date()),
            ),
          )
          .returning();
        if (!claimed) {
          throw Object.assign(new Error("Invalid, expired, or already used authorization code"), {
            status: 400,
            code: "invalid_grant",
          });
        }

        const plain = randomKey(KEY_PREFIX);
        await tx.insert(schema.apiKeys).values({
          id: id("key"),
          userId: claimed.userId,
          workspaceId: claimed.workspaceId,
          name: "OAuth PKCE",
          keyHash: sha256(plain),
          keyPrefix: plain.slice(0, 12),
          scopes: claimed.scopes,
        });
        return { key: plain };
      });
      return Response.json({ key: result.key, key_type: "user" });
    }

    const auth = await authenticateRequest(req);
    if (typeof body.code_challenge !== "string" || !/^[a-f0-9]{64}$/i.test(body.code_challenge)) {
      throw Object.assign(new Error("code_challenge must be a SHA-256 hex digest"), {
        status: 400,
        code: "invalid_request",
      });
    }
    const code = randomKey("nxc_", 16);
    await db.insert(schema.oauthCodes).values({
      id: id("oauth"),
      userId: auth.userId,
      workspaceId: auth.workspaceId ?? null,
      scopes: defaultScopes(false),
      codeHash: sha256(code),
      codeChallenge: body.code_challenge.toLowerCase(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    return Response.json({ code });
  } catch (error) {
    return jsonError(error);
  }
}
