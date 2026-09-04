import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";

const dataDir = mkdtempSync(join(tmpdir(), "nexus-admin-credit-test-"));
process.env.ENABLE_PGLITE = "true";
process.env.PGLITE_DATA_DIR = dataDir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.POSTGRES_PRISMA_URL;

let database: typeof import("../src/lib/db");
let adjustment: typeof import("../src/lib/admin/credit-adjustment");

before(async () => {
  database = await import("../src/lib/db");
  adjustment = await import("../src/lib/admin/credit-adjustment");
  await database.ensureDb();
  await database.db.insert(database.schema.users).values([
    { id: "usr_admin_actor", name: "Admin", email: "admin@nexus.test", creditMicros: 0 },
    { id: "usr_admin_target", name: "Customer", email: "customer@nexus.test", creditMicros: 1_000_000 },
  ]);
});

after(() => rmSync(dataDir, { recursive: true, force: true }));

describe("platform credit adjustment", () => {
  it("applies once and audits the operator in the same transaction", async () => {
    const input = {
      actorUserId: "usr_admin_actor",
      actorEmail: "admin@nexus.test",
      targetUserId: "usr_admin_target",
      micros: 250_000,
      reason: "Ticket FIN-104 customer correction",
      idempotencyKey: "fin_104_once",
    };
    assert.deepEqual(await adjustment.adjustUserCredits(input), { applied: true, balanceMicros: 1_250_000 });
    assert.deepEqual(await adjustment.adjustUserCredits(input), { applied: false, balanceMicros: 1_250_000 });
    const ledger = await database.db.select().from(database.schema.creditLedger).where(eq(database.schema.creditLedger.userId, input.targetUserId));
    const audit = await database.db.select().from(database.schema.auditLogs).where(eq(database.schema.auditLogs.userId, input.actorUserId));
    assert.equal(ledger.filter((entry) => entry.type === "admin_adjustment").length, 1);
    assert.equal(audit.filter((entry) => entry.action === "platform.credit_adjustment").length, 1);
  });

  it("rejects a debit that would make the wallet negative and rolls back its ledger row", async () => {
    await assert.rejects(
      () => adjustment.adjustUserCredits({
        actorUserId: "usr_admin_actor",
        actorEmail: "admin@nexus.test",
        targetUserId: "usr_admin_target",
        micros: -2_000_000,
        reason: "Ticket FIN-105 invalid debit correction",
        idempotencyKey: "fin_105_debit",
      }),
      (error: unknown) => (error as { status?: number }).status === 409,
    );
    const rows = await database.db.select().from(database.schema.creditLedger).where(eq(database.schema.creditLedger.generationId, "admin:fin_105_debit"));
    assert.equal(rows.length, 0);
  });

  it("rejects reuse of an idempotency key for another amount", async () => {
    await assert.rejects(
      () => adjustment.adjustUserCredits({
        actorUserId: "usr_admin_actor",
        actorEmail: "admin@nexus.test",
        targetUserId: "usr_admin_target",
        micros: 100_000,
        reason: "Ticket FIN-104 conflicting retry",
        idempotencyKey: "fin_104_once",
      }),
      (error: unknown) => (error as { status?: number }).status === 409,
    );
  });
});
