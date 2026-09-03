import { eq } from "drizzle-orm";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { sha256, randomKey } from "@/lib/crypto";
import { db, schema } from "@/lib/db";
import { id } from "@/lib/ids";
import { KEY_PREFIX } from "@/lib/config";

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
    const body = await req.json();
    if (body.code && body.code_verifier) {
      const [row] = await db
        .select()
        .from(schema.oauthCodes)
        .where(eq(schema.oauthCodes.codeHash, sha256(body.code)))
        .limit(1);
      if (!row || row.used || row.expiresAt < new Date()) {
        return jsonError(Object.assign(new Error("Invalid or expired code"), { status: 400 }));
      }
      const challenge = sha256(body.code_verifier);
      if (challenge !== row.codeChallenge) {
        return jsonError(Object.assign(new Error("PKCE verification failed"), { status: 400 }));
      }
      const plain = randomKey(KEY_PREFIX);
      await db.insert(schema.apiKeys).values({
        id: id("key"),
        userId: row.userId,
        name: "OAuth PKCE",
        keyHash: sha256(plain),
        keyPrefix: plain.slice(0, 12),
      });
      await db.update(schema.oauthCodes).set({ used: true }).where(eq(schema.oauthCodes.id, row.id));
      return Response.json({ key: plain, key_type: "user" });
    }

    const auth = await authenticateRequest(req);
    const code = randomKey("nxc_", 16);
    await db.insert(schema.oauthCodes).values({
      id: id("oauth"),
      userId: auth.userId,
      codeHash: sha256(code),
      codeChallenge: body.code_challenge,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    return Response.json({ code });
  } catch (error) {
    return jsonError(error);
  }
}
