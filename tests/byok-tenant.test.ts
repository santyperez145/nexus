import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import type { AuthContext } from "../src/lib/gateway/types";

const dataDir = mkdtempSync(join(tmpdir(), "nexus-byok-tenant-test-"));
process.env.ENABLE_PGLITE = "true";
process.env.PGLITE_DATA_DIR = dataDir;
process.env.CREDENTIALS_SECRET = "nexus-byok-tenant-tests-secret-32-chars";
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.POSTGRES_PRISMA_URL;

let database: typeof import("../src/lib/db");
let crypto: typeof import("../src/lib/crypto");
let byok: typeof import("../src/lib/gateway/byok");

const ownerId = "usr_byok_owner";
const memberId = "usr_byok_member";
const workspaceId = "ws_byok_shared";

function auth(userId: string, workspace?: string | null): AuthContext {
  return {
    userId,
    billingUserId: workspace ? ownerId : userId,
    workspaceId: workspace ?? null,
    workspaceIds: [workspaceId],
    isManagement: true,
    scopes: ["*"],
    plan: "team",
    creditMicros: 1_000_000,
    zdr: false,
    allowTraining: false,
    logPrompts: false,
  };
}

before(async () => {
  database = await import("../src/lib/db");
  crypto = await import("../src/lib/crypto");
  byok = await import("../src/lib/gateway/byok");
  await database.ensureDb();
  await database.db.insert(database.schema.users).values([
    {
      id: ownerId,
      name: "BYOK Owner",
      email: "byok-owner@nexus.test",
      plan: "team",
    },
    {
      id: memberId,
      name: "BYOK Member",
      email: "byok-member@nexus.test",
      plan: "team",
    },
  ]);
  await database.db.insert(database.schema.organizations).values({
    id: "org_byok",
    name: "BYOK Org",
    slug: "byok-org",
    ownerId,
  });
  await database.db.insert(database.schema.organizationMembers).values([
    {
      id: "orgmem_byok_owner",
      organizationId: "org_byok",
      userId: ownerId,
      role: "owner",
    },
    {
      id: "orgmem_byok_member",
      organizationId: "org_byok",
      userId: memberId,
      role: "member",
    },
  ]);
  await database.db.insert(database.schema.workspaces).values({
    id: workspaceId,
    userId: ownerId,
    organizationId: "org_byok",
    name: "Shared BYOK",
    slug: "shared-byok",
    isDefault: true,
  });
  await database.db.insert(database.schema.workspaceMembers).values({
    id: "wsm_byok_member",
    workspaceId,
    userId: memberId,
  });
  await database.db.insert(database.schema.byokCredentials).values([
    {
      id: "byok_personal",
      userId: ownerId,
      provider: "openai",
      encryptedKey: crypto.encryptSecret("personal-openai-secret"),
      label: "Personal",
    },
    {
      id: "byok_shared",
      userId: ownerId,
      workspaceId,
      provider: "openai",
      encryptedKey: crypto.encryptSecret("workspace-openai-secret"),
      label: "Shared",
    },
  ]);
});

after(() => rmSync(dataDir, { recursive: true, force: true }));

describe("BYOK tenant boundaries", () => {
  it("never inherits a shared credential without an active workspace", async () => {
    assert.equal(await byok.resolveByokKey(ownerId, "openai", auth(ownerId)), "personal-openai-secret");
    assert.equal(await byok.resolveByokKey(memberId, "openai", auth(memberId)), undefined);
  });

  it("resolves the shared secret only for the exact accessible workspace", async () => {
    assert.equal(
      await byok.resolveByokKey(memberId, "openai", auth(memberId, workspaceId)),
      "workspace-openai-secret",
    );
    assert.equal(
      await byok.resolveByokKey(memberId, "openai", {
        ...auth(memberId, workspaceId),
        workspaceIds: ["ws_other"],
      }),
      undefined,
    );
  });

  it("replaces one scope atomically, wipes the old ciphertext and audits metadata only", async () => {
    const result = await byok.replaceByokCredential({
      auth: auth(ownerId),
      provider: "openai",
      key: "replacement-openai-secret",
      label: "Rotated",
      headers: new Headers({ "x-forwarded-for": "203.0.113.8, 10.0.0.1" }),
    });
    assert.equal(result.replaced, true);
    assert.equal(await byok.resolveByokKey(ownerId, "openai", auth(ownerId)), "replacement-openai-secret");

    const rows = await database.db
      .select()
      .from(database.schema.byokCredentials)
      .where(
        and(
          eq(database.schema.byokCredentials.userId, ownerId),
          eq(database.schema.byokCredentials.provider, "openai"),
        ),
      );
    assert.equal(rows.filter((row) => !row.deleted && !row.workspaceId).length, 1);
    const old = rows.find((row) => row.id === "byok_personal");
    assert.equal(old?.deleted, true);
    assert.equal(old?.encryptedKey, "");

    const [audit] = await database.db
      .select()
      .from(database.schema.auditLogs)
      .where(eq(database.schema.auditLogs.resourceId, result.row.id));
    assert.equal(audit.action, "byok.replace");
    assert.equal(audit.ip, "203.0.113.8");
    assert.deepEqual(audit.meta, { provider: "openai", replaced: true });
    assert.equal(JSON.stringify(audit).includes("replacement-openai-secret"), false);

    await assert.rejects(() =>
      database.db.insert(database.schema.byokCredentials).values({
        id: "byok_duplicate_active",
        userId: ownerId,
        provider: "openai",
        encryptedKey: crypto.encryptSecret("must-not-be-inserted"),
      }),
    );
  });

  it("cannot remove another scope and wipes the intended secret on deletion", async () => {
    assert.equal(
      await byok.removeByokCredential({
        auth: auth(memberId),
        credentialId: "byok_shared",
      }),
      false,
    );
    assert.equal(
      await byok.resolveByokKey(memberId, "openai", auth(memberId, workspaceId)),
      "workspace-openai-secret",
    );
    assert.equal(
      await byok.removeByokCredential({
        auth: auth(ownerId, workspaceId),
        credentialId: "byok_shared",
        workspaceId,
      }),
      true,
    );
    const [removed] = await database.db
      .select()
      .from(database.schema.byokCredentials)
      .where(eq(database.schema.byokCredentials.id, "byok_shared"));
    assert.equal(removed.deleted, true);
    assert.equal(removed.encryptedKey, "");
  });

  it("accepts only routed providers plus the video provider", () => {
    assert.equal(byok.isSupportedByokProvider("openai"), true);
    assert.equal(byok.isSupportedByokProvider("fal"), true);
    assert.equal(byok.isSupportedByokProvider("made-up-provider"), false);
  });
});

describe("BYOK migration", () => {
  it("wipes stale duplicates and orphans before enforcing constraints", async () => {
    const legacy = new PGlite();
    try {
      await legacy.exec(`
        CREATE TABLE "user" (id text PRIMARY KEY);
        CREATE TABLE "workspace" (id text PRIMARY KEY);
        CREATE TABLE "byok_credential" (
          id text PRIMARY KEY,
          user_id text NOT NULL REFERENCES "user"(id),
          workspace_id text,
          provider text NOT NULL,
          encrypted_key text NOT NULL,
          label text,
          deleted boolean NOT NULL DEFAULT false,
          created_at timestamp NOT NULL
        );
        INSERT INTO "user" (id) VALUES ('usr_legacy');
        INSERT INTO "workspace" (id) VALUES ('ws_legacy');
        INSERT INTO "byok_credential" VALUES
          ('personal_old', 'usr_legacy', NULL, 'openai', 'secret-old', NULL, false, '2026-01-01'),
          ('personal_new', 'usr_legacy', NULL, 'openai', 'secret-new', NULL, false, '2026-02-01'),
          ('workspace_old', 'usr_legacy', 'ws_legacy', 'openai', 'shared-old', NULL, false, '2026-01-01'),
          ('workspace_new', 'usr_legacy', 'ws_legacy', 'openai', 'shared-new', NULL, false, '2026-02-01'),
          ('orphan', 'usr_legacy', 'ws_missing', 'openai', 'orphan-secret', NULL, false, '2026-03-01');
      `);
      const migration = readFileSync(
        join(process.cwd(), "drizzle", "0009_dark_franklin_richards.sql"),
        "utf8",
      );
      for (const statement of migration.split("--> statement-breakpoint")) {
        if (statement.trim()) await legacy.exec(statement);
      }
      const result = await legacy.query<{
        id: string;
        workspace_id: string | null;
        encrypted_key: string;
        deleted: boolean;
      }>(`SELECT id, workspace_id, encrypted_key, deleted FROM "byok_credential" ORDER BY id`);
      const rows = new Map(result.rows.map((row) => [row.id, row]));
      assert.equal(rows.get("personal_old")?.deleted, true);
      assert.equal(rows.get("personal_old")?.encrypted_key, "");
      assert.equal(rows.get("personal_new")?.deleted, false);
      assert.equal(rows.get("workspace_old")?.deleted, true);
      assert.equal(rows.get("workspace_old")?.encrypted_key, "");
      assert.equal(rows.get("workspace_new")?.deleted, false);
      assert.equal(rows.get("orphan")?.deleted, true);
      assert.equal(rows.get("orphan")?.encrypted_key, "");
      assert.equal(rows.get("orphan")?.workspace_id, null);
      await assert.rejects(() =>
        legacy.exec(
          `INSERT INTO "byok_credential" VALUES ('duplicate', 'usr_legacy', NULL, 'openai', 'x', NULL, false, now())`,
        ),
      );
    } finally {
      await legacy.close();
    }
  });
});
