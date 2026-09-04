import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import type { AuthContext } from "../src/lib/gateway/types";

const dataDir = mkdtempSync(join(tmpdir(), "nexus-privacy-retention-test-"));
process.env.ENABLE_PGLITE = "true";
process.env.PGLITE_DATA_DIR = dataDir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.POSTGRES_PRISMA_URL;

let database: typeof import("../src/lib/db");
let preferences: typeof import("../src/lib/privacy/preferences");
let retention: typeof import("../src/lib/privacy/retention");
let billing: typeof import("../src/lib/gateway/billing");

const userId = "usr_privacy_retention";

before(async () => {
  database = await import("../src/lib/db");
  preferences = await import("../src/lib/privacy/preferences");
  retention = await import("../src/lib/privacy/retention");
  billing = await import("../src/lib/gateway/billing");
  await database.ensureDb();
  await database.db.insert(database.schema.users).values({
    id: userId,
    name: "Privacy Test",
    email: "privacy-retention@nexus.test",
    creditMicros: 1_000_000,
    zdr: false,
    logPrompts: true,
    allowTraining: true,
    notifyLowBalance: false,
  });
  await database.db.insert(database.schema.users).values({
    id: "usr_privacy_legacy",
    name: "Legacy Privacy Test",
    email: "privacy-legacy@nexus.test",
    zdr: true,
    logPrompts: true,
  });
  await database.db.insert(database.schema.generations).values({
    id: "gen_privacy_history",
    userId,
    requestedModel: "openai/gpt-test",
    routedModel: "openai/gpt-test",
    provider: "openai",
    prompt: "private prompt",
    completion: "private answer",
    metadata: { filename: "private-recording.wav", modality: "transcription" },
  });
  await database.db.insert(database.schema.videoJobs).values({
    id: "vid_privacy_history",
    userId,
    model: "nexus/video",
    prompt: "private video prompt",
    status: "completed",
    resultUrl: "https://provider.example/private-output.mp4",
  });
  await database.db.insert(database.schema.generations).values({
    id: "gen_privacy_legacy",
    userId: "usr_privacy_legacy",
    requestedModel: "openai/gpt-test",
    routedModel: "openai/gpt-test",
    provider: "openai",
    prompt: "legacy prompt",
    completion: "legacy answer",
    metadata: { filename: "legacy.wav", modality: "transcription" },
  });
  await database.db.insert(database.schema.videoJobs).values({
    id: "vid_privacy_legacy",
    userId: "usr_privacy_legacy",
    model: "nexus/video",
    prompt: "legacy video prompt",
    status: "completed",
    resultUrl: "https://provider.example/legacy-output.mp4",
  });
});

after(() => rmSync(dataDir, { recursive: true, force: true }));

describe("privacy retention", () => {
  it("backfills legacy ZDR accounts during migration", async () => {
    const migration = readFileSync(
      join(process.cwd(), "drizzle", "0008_broad_boom_boom.sql"),
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) await database.db.execute(sql.raw(statement));
    }
    const [user] = await database.db
      .select()
      .from(database.schema.users)
      .where(eq(database.schema.users.id, "usr_privacy_legacy"));
    const [generation] = await database.db
      .select()
      .from(database.schema.generations)
      .where(eq(database.schema.generations.id, "gen_privacy_legacy"));
    const [video] = await database.db
      .select()
      .from(database.schema.videoJobs)
      .where(eq(database.schema.videoJobs.id, "vid_privacy_legacy"));
    assert.equal(user.logPrompts, false);
    assert.equal(generation.prompt, null);
    assert.equal(generation.completion, null);
    assert.deepEqual(generation.metadata, { modality: "transcription" });
    assert.equal(video.prompt, null);
    assert.equal(video.resultUrl, null);
  });

  it("makes ZDR and payload logging mutually exclusive and purges stored content atomically", async () => {
    const result = await preferences.applyPreferenceUpdate(userId, {
      zdr: true,
      logPrompts: true,
      allowTraining: false,
    });
    assert.deepEqual(result.privacy, { zdr: true, logPrompts: false, allowTraining: false });
    assert.deepEqual(result.purged, { generations: 1, videoPrompts: 1, videoResults: 1 });

    const [user] = await database.db
      .select()
      .from(database.schema.users)
      .where(eq(database.schema.users.id, userId));
    assert.equal(user.zdr, true);
    assert.equal(user.logPrompts, false);

    const [generation] = await database.db
      .select()
      .from(database.schema.generations)
      .where(eq(database.schema.generations.id, "gen_privacy_history"));
    assert.equal(generation.prompt, null);
    assert.equal(generation.completion, null);
    assert.deepEqual(generation.metadata, { modality: "transcription" });

    const [video] = await database.db
      .select()
      .from(database.schema.videoJobs)
      .where(eq(database.schema.videoJobs.id, "vid_privacy_history"));
    assert.equal(video.prompt, null);
    assert.equal(video.resultUrl, null);

    const [audit] = await database.db
      .select()
      .from(database.schema.auditLogs)
      .where(eq(database.schema.auditLogs.action, "privacy.settings_updated"));
    assert.equal(audit.userId, userId);
    assert.equal(JSON.stringify(audit.meta).includes("private prompt"), false);
  });

  it("does not grant the logging discount to ZDR or request-level no-retention traffic", async () => {
    const zdrAuth: AuthContext = {
      userId,
      isManagement: false,
      scopes: ["inference:write"],
      creditMicros: 1_000_000,
      zdr: true,
      allowTraining: false,
      logPrompts: true,
    };
    const zdrCharge = await billing.settleUsage({
      auth: zdrAuth,
      generationId: "gen_privacy_zdr_charge",
      promptTokens: 100,
      completionTokens: 0,
      pricing: { prompt: 0.000001, completion: 0 },
      isFree: false,
      isByok: false,
    });
    assert.equal(zdrCharge.micros, 100);

    const requestLevelCharge = await billing.settleUsage({
      auth: { ...zdrAuth, zdr: false, logPrompts: true },
      generationId: "gen_privacy_request_charge",
      promptTokens: 100,
      completionTokens: 0,
      pricing: { prompt: 0.000001, completion: 0 },
      isFree: false,
      isByok: false,
      logPrompts: false,
    });
    assert.equal(requestLevelCharge.micros, 100);
  });

  it("fails video closed under ZDR and stores prompts only with explicit retention", () => {
    assert.equal(retention.shouldRetainPayloads({ zdr: false, logPrompts: true }), true);
    assert.equal(retention.shouldRetainPayloads({ zdr: false, logPrompts: true }, true), false);
    assert.equal(retention.shouldRetainPayloads({ zdr: true, logPrompts: true }), false);
    assert.throws(
      () => retention.assertVideoRetentionCompatible({ zdr: true }),
      (error: unknown) =>
        (error as { status?: number; code?: string }).status === 400 &&
        (error as { code?: string }).code === "zdr_incompatible",
    );
  });
});
