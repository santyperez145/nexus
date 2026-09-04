import { and, eq, isNotNull, or, sql } from "drizzle-orm";
import { schema, withTransaction } from "@/lib/db";
import { id } from "@/lib/ids";

export type PreferenceUpdate = {
  zdr?: boolean;
  logPrompts?: boolean;
  allowTraining?: boolean;
  defaultModel?: string;
  autoTopupEnabled?: boolean;
  autoTopupThresholdUsd?: string;
  autoTopupAmountUsd?: string;
  notifyLowBalance?: boolean;
  notifyKeyLimit?: boolean;
  notifyOrgInvite?: boolean;
  lowBalanceThresholdUsd?: string;
};

export async function applyPreferenceUpdate(userId: string, update: PreferenceUpdate) {
  return withTransaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`);
    const [current] = await tx
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!current) {
      throw Object.assign(new Error("Account not found"), { status: 404, code: "not_found" });
    }

    const nextZdr = update.zdr ?? current.zdr;
    const requestedLogging = update.logPrompts ?? current.logPrompts;
    const nextLogPrompts = nextZdr ? false : requestedLogging;
    const nextAllowTraining = update.allowTraining ?? current.allowTraining;
    const purgeHistory = nextZdr || !nextLogPrompts;

    let purgedGenerations = 0;
    let purgedVideoPrompts = 0;
    let purgedVideoResults = 0;
    if (purgeHistory) {
      const generations = await tx
        .update(schema.generations)
        .set({
          prompt: null,
          completion: null,
          metadata: sql`CASE
            WHEN ${schema.generations.metadata} IS NULL THEN NULL
            ELSE ${schema.generations.metadata} - 'filename'
          END`,
        })
        .where(
          and(
            eq(schema.generations.userId, userId),
            or(
              isNotNull(schema.generations.prompt),
              isNotNull(schema.generations.completion),
              sql`${schema.generations.metadata} ? 'filename'`,
            ),
          ),
        )
        .returning();
      purgedGenerations = generations.length;

      const videoPrompts = await tx
        .update(schema.videoJobs)
        .set({ prompt: null })
        .where(and(eq(schema.videoJobs.userId, userId), isNotNull(schema.videoJobs.prompt)))
        .returning();
      purgedVideoPrompts = videoPrompts.length;

      if (nextZdr) {
        const videoResults = await tx
          .update(schema.videoJobs)
          .set({ resultUrl: null })
          .where(and(eq(schema.videoJobs.userId, userId), isNotNull(schema.videoJobs.resultUrl)))
          .returning();
        purgedVideoResults = videoResults.length;
      }
    }

    const [updated] = await tx
      .update(schema.users)
      .set({
        zdr: nextZdr,
        logPrompts: nextLogPrompts,
        allowTraining: nextAllowTraining,
        defaultModel: update.defaultModel,
        autoTopupEnabled: update.autoTopupEnabled,
        autoTopupThresholdUsd: update.autoTopupThresholdUsd,
        autoTopupAmountUsd: update.autoTopupAmountUsd,
        notifyLowBalance: update.notifyLowBalance,
        notifyKeyLimit: update.notifyKeyLimit,
        notifyOrgInvite: update.notifyOrgInvite,
        lowBalanceThresholdUsd: update.lowBalanceThresholdUsd,
      })
      .where(eq(schema.users.id, userId))
      .returning();

    const privacyChanged =
      current.zdr !== nextZdr ||
      current.logPrompts !== nextLogPrompts ||
      current.allowTraining !== nextAllowTraining;
    if (privacyChanged || purgedGenerations || purgedVideoPrompts || purgedVideoResults) {
      await tx.insert(schema.auditLogs).values({
        id: id("aud"),
        userId,
        action: "privacy.settings_updated",
        resource: "user",
        resourceId: userId,
        meta: {
          from: {
            zdr: current.zdr,
            logPrompts: current.logPrompts,
            allowTraining: current.allowTraining,
          },
          to: { zdr: nextZdr, logPrompts: nextLogPrompts, allowTraining: nextAllowTraining },
          purged: {
            generations: purgedGenerations,
            videoPrompts: purgedVideoPrompts,
            videoResults: purgedVideoResults,
          },
        },
      });
    }

    return {
      user: updated,
      privacy: { zdr: nextZdr, logPrompts: nextLogPrompts, allowTraining: nextAllowTraining },
      purged: {
        generations: purgedGenerations,
        videoPrompts: purgedVideoPrompts,
        videoResults: purgedVideoResults,
      },
    };
  });
}
