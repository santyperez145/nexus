import { and, eq, sql } from "drizzle-orm";
import { schema, withTransaction } from "@/lib/db";
import { id } from "@/lib/ids";
import { issueApiKey, lockUserForKeyMutation } from "@/lib/keys";

export async function provisionUserAccount(userId: string, signupBonusMicros: number) {
  return withTransaction(async (tx) => {
    await lockUserForKeyMutation(tx, userId);

    let [workspace] = await tx
      .select()
      .from(schema.workspaces)
      .where(and(eq(schema.workspaces.userId, userId), eq(schema.workspaces.isDefault, true)))
      .limit(1);
    if (!workspace) {
      [workspace] = await tx
        .insert(schema.workspaces)
        .values({
          id: id("ws"),
          userId,
          name: "Default",
          slug: "default",
          isDefault: true,
        })
        .returning();
    }

    if (signupBonusMicros > 0) {
      const [existingBonus] = await tx
        .select({ id: schema.creditLedger.id })
        .from(schema.creditLedger)
        .where(
          and(
            eq(schema.creditLedger.userId, userId),
            eq(schema.creditLedger.type, "signup_bonus"),
          ),
        )
        .limit(1);
      if (!existingBonus) {
        await tx.insert(schema.creditLedger).values({
          id: id("led"),
          userId,
          type: "signup_bonus",
          micros: signupBonusMicros,
          generationId: `signup:${userId}`,
          note: "Crédito de bienvenida",
        });
        await tx
          .update(schema.users)
          .set({ creditMicros: sql`${schema.users.creditMicros} + ${signupBonusMicros}` })
          .where(eq(schema.users.id, userId));
      }
    }

    const [existingKey] = await tx
      .select({ id: schema.apiKeys.id })
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.userId, userId))
      .limit(1);
    if (!existingKey) {
      await issueApiKey(
        {
          userId,
          name: "Default",
          workspaceId: workspace.id,
          disabled: true,
          pendingReveal: true,
        },
        tx,
      );
    }

    return { workspaceId: workspace.id };
  });
}

export async function claimWelcomeApiKey(userId: string) {
  return withTransaction(async (tx) => {
    await lockUserForKeyMutation(tx, userId);
    const [pending] = await tx
      .select()
      .from(schema.apiKeys)
      .where(
        and(
          eq(schema.apiKeys.userId, userId),
          eq(schema.apiKeys.pendingReveal, true),
        ),
      )
      .limit(1);
    if (!pending) return null;

    const issued = await issueApiKey(
      {
        userId,
        name: pending.name,
        workspaceId: pending.workspaceId,
        isManagement: pending.isManagement,
        limitMicros: pending.limitMicros,
        limitReset: pending.limitReset,
        includeByokInLimit: pending.includeByokInLimit,
        scopes: pending.scopes ?? undefined,
      },
      tx,
    );
    await tx.delete(schema.apiKeys).where(eq(schema.apiKeys.id, pending.id));
    return issued;
  });
}
