import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { AuthContext } from "../src/lib/gateway/types";

const dataDir = mkdtempSync(join(tmpdir(), "nexus-ledger-test-"));
process.env.ENABLE_PGLITE = "true";
process.env.PGLITE_DATA_DIR = dataDir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.POSTGRES_PRISMA_URL;

let database: typeof import("../src/lib/db");
let billing: typeof import("../src/lib/gateway/billing");

const userId = "usr_ledger_atomic";
const keyId = "key_ledger_atomic";
const workspaceId = "ws_ledger_atomic";
const auth: AuthContext = {
  userId,
  apiKeyId: keyId,
  workspaceId,
  isManagement: false,
  scopes: ["inference:write"],
  creditMicros: 1_000_000,
  zdr: false,
  allowTraining: true,
  logPrompts: false,
};

before(async () => {
  database = await import("../src/lib/db");
  billing = await import("../src/lib/gateway/billing");
  await database.ensureDb();
  await database.db.insert(database.schema.users).values({
    id: userId,
    name: "Ledger Test",
    email: "ledger-atomic@nexus.test",
    creditMicros: 1_000_000,
    notifyLowBalance: false,
  });
  await database.db.insert(database.schema.workspaces).values({
    id: workspaceId,
    userId,
    name: "Atomic",
    slug: "atomic",
  });
  await database.db.insert(database.schema.workspaceBudgets).values({
    id: "budget_ledger_atomic",
    workspaceId,
    interval: "monthly",
    limitMicros: 1_000_000,
  });
  await database.db.insert(database.schema.apiKeys).values({
    id: keyId,
    userId,
    workspaceId,
    name: "Atomic key",
    keyHash: "hash_ledger_atomic",
    keyPrefix: "sk-nx-test",
    limitMicros: 1_000_000,
    scopes: ["inference:write"],
  });
  await database.db.insert(database.schema.users).values({
    id: "usr_org_owner",
    name: "Org Owner",
    email: "org-owner@nexus.test",
  });
  await database.db.insert(database.schema.organizations).values({
    id: "org_shared",
    name: "Shared Org",
    slug: "shared-org",
    ownerId: "usr_org_owner",
  });
  await database.db.insert(database.schema.organizationMembers).values({
    id: "member_shared",
    organizationId: "org_shared",
    userId,
    role: "member",
  });
  await database.db.insert(database.schema.workspaces).values({
    id: "ws_shared_org",
    userId: "usr_org_owner",
    organizationId: "org_shared",
    name: "Shared workspace",
    slug: "shared-workspace",
  });
});

after(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe("transactional credit ledger", () => {
  it("reserves, settles and makes duplicate release a no-op", async () => {
    const reservation = await billing.reserveCredits(auth, "gen_atomic_settle", 200_000);
    const settled = await billing.settleUsage({
      auth,
      generationId: reservation.generationId,
      promptTokens: 1_000,
      completionTokens: 0,
      pricing: { prompt: 0.0001, completion: 0 },
      isFree: false,
      isByok: false,
      reservation,
    });
    assert.equal(settled.micros, 100_000);

    await billing.releaseReserve(auth, reservation);
    await billing.releaseReserve(auth, reservation);

    const [user] = await database.db
      .select({ creditMicros: database.schema.users.creditMicros })
      .from(database.schema.users)
      .where(eq(database.schema.users.id, userId));
    const [key] = await database.db
      .select({ usageMicros: database.schema.apiKeys.usageMicros })
      .from(database.schema.apiKeys)
      .where(eq(database.schema.apiKeys.id, keyId));
    const [budget] = await database.db
      .select({ spentMicros: database.schema.workspaceBudgets.spentMicros })
      .from(database.schema.workspaceBudgets)
      .where(eq(database.schema.workspaceBudgets.workspaceId, workspaceId));
    assert.equal(user.creditMicros, 900_000);
    assert.equal(key.usageMicros, 100_000);
    assert.equal(budget.spentMicros, 100_000);
  });

  it("releases a failed reservation exactly once", async () => {
    const beforeBalance = auth.creditMicros;
    const reservation = await billing.reserveCredits(auth, "gen_atomic_release", 50_000);
    await billing.releaseReserve(auth, reservation);
    await billing.releaseReserve(auth, reservation);
    const [user] = await database.db
      .select({ creditMicros: database.schema.users.creditMicros })
      .from(database.schema.users)
      .where(eq(database.schema.users.id, userId));
    assert.equal(user.creditMicros, beforeBalance);
  });
});

describe("organization workspace RBAC", () => {
  it("hydrates shared workspaces but reserves management for owner/admin", async () => {
    const tenant = await import("../src/lib/gateway/tenant");
    const workspaceIds = await tenant.accessibleWorkspaceIds(userId);
    assert.ok(workspaceIds.includes(workspaceId));
    assert.ok(workspaceIds.includes("ws_shared_org"));
    assert.equal(await tenant.canManageWorkspace({ ...auth, workspaceIds }, "ws_shared_org"), false);
    await database.db
      .update(database.schema.organizationMembers)
      .set({ role: "admin" })
      .where(eq(database.schema.organizationMembers.id, "member_shared"));
    assert.equal(await tenant.canManageWorkspace({ ...auth, workspaceIds }, "ws_shared_org"), true);
    assert.equal(
      tenant.canAccess(
        { ...auth, workspaceId: "ws_shared_org", workspaceIds },
        { userId: "usr_org_owner", workspaceId: "ws_shared_org" },
      ),
      true,
    );
  });
});
