import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { sha256 } from "../src/lib/crypto";

const dataDir = mkdtempSync(join(tmpdir(), "nexus-onboarding-test-"));
process.env.ENABLE_PGLITE = "true";
process.env.PGLITE_DATA_DIR = dataDir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.POSTGRES_PRISMA_URL;

let database: typeof import("../src/lib/db");
let onboarding: typeof import("../src/lib/onboarding/provision");
let keys: typeof import("../src/lib/keys");

const userId = "usr_onboarding_atomic";

before(async () => {
  database = await import("../src/lib/db");
  onboarding = await import("../src/lib/onboarding/provision");
  keys = await import("../src/lib/keys");
  await database.ensureDb();
  await database.db.insert(database.schema.users).values({
    id: userId,
    name: "Atomic Onboarding",
    email: "atomic-onboarding@nexus.test",
  });
});

after(() => rmSync(dataDir, { recursive: true, force: true }));

describe("transactional onboarding and API keys", () => {
  it("provisions exactly one workspace, pending key and signup credit", async () => {
    await onboarding.provisionUserAccount(userId, 1_000_000);
    await onboarding.provisionUserAccount(userId, 1_000_000);

    const [user] = await database.db
      .select()
      .from(database.schema.users)
      .where(eq(database.schema.users.id, userId));
    const workspaces = await database.db
      .select()
      .from(database.schema.workspaces)
      .where(eq(database.schema.workspaces.userId, userId));
    const apiKeys = await database.db
      .select()
      .from(database.schema.apiKeys)
      .where(eq(database.schema.apiKeys.userId, userId));
    const ledger = await database.db
      .select()
      .from(database.schema.creditLedger)
      .where(eq(database.schema.creditLedger.userId, userId));

    assert.equal(user.creditMicros, 1_000_000);
    assert.equal(workspaces.length, 1);
    assert.equal(workspaces[0].isDefault, true);
    assert.equal(apiKeys.length, 1);
    assert.equal(apiKeys[0].pendingReveal, true);
    assert.equal(apiKeys[0].disabled, true);
    assert.equal(ledger.filter((entry) => entry.type === "signup_bonus").length, 1);
  });

  it("reveals the welcome key once and persists only its hash", async () => {
    const issued = await onboarding.claimWelcomeApiKey(userId);
    assert.ok(issued?.key.startsWith("sk-nx-"));
    assert.equal(await onboarding.claimWelcomeApiKey(userId), null);

    const apiKeys = await database.db
      .select()
      .from(database.schema.apiKeys)
      .where(eq(database.schema.apiKeys.userId, userId));
    assert.equal(apiKeys.length, 1);
    assert.equal(apiKeys[0].pendingReveal, false);
    assert.equal(apiKeys[0].disabled, false);
    assert.equal(apiKeys[0].keyHash, sha256(issued!.key));
    assert.equal(apiKeys[0].keyHash.includes(issued!.key), false);
  });

  it("serializes plan limits and rotates without leaving the old key active", async () => {
    const [current] = await database.db
      .select()
      .from(database.schema.apiKeys)
      .where(eq(database.schema.apiKeys.userId, userId));
    const second = await keys.createApiKeyWithinLimit({ userId, name: "Second" }, 2);
    await assert.rejects(
      () => keys.createApiKeyWithinLimit({ userId, name: "Overflow" }, 2),
      (error: unknown) => (error as { code?: string }).code === "plan_limit",
    );

    const rotated = await keys.rotateApiKey({ userId, keyId: current.id });
    assert.notEqual(rotated.id, current.id);
    const apiKeys = await database.db
      .select()
      .from(database.schema.apiKeys)
      .where(eq(database.schema.apiKeys.userId, userId));
    assert.equal(apiKeys.length, 2);
    assert.equal(apiKeys.some((key) => key.id === current.id), false);
    assert.equal(apiKeys.some((key) => key.id === second.id), true);
    assert.equal(apiKeys.some((key) => key.id === rotated.id), true);
  });
});
