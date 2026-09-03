import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function secretKey() {
  const secret = process.env.CREDENTIALS_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("CREDENTIALS_SECRET (or BETTER_AUTH_SECRET) is required in production");
    }
    return scryptSync("nexus-dev-secret", "nexus-byok", 32);
  }
  return scryptSync(secret, "nexus-byok", 32);
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

export function decryptSecret(payload: string) {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  const decipher = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function randomKey(prefix: string, bytes = 24) {
  return `${prefix}${randomBytes(bytes).toString("base64url")}`;
}
