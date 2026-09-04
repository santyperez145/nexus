import { and, eq, gte, sql } from "drizzle-orm";
import { schema, withTransaction } from "@/lib/db";
import { id } from "@/lib/ids";

export const MAX_ADMIN_CREDIT_ADJUSTMENT_MICROS = 10_000 * 1_000_000;

type Adjustment = {
  actorUserId: string;
  actorEmail: string;
  targetUserId: string;
  micros: number;
  reason: string;
  idempotencyKey: string;
};

function invalid(message: string, status = 400, code = "invalid_request") {
  return Object.assign(new Error(message), { status, code });
}

export async function adjustUserCredits(input: Adjustment) {
  const reason = input.reason.trim();
  if (!Number.isSafeInteger(input.micros) || input.micros === 0) {
    throw invalid("Credit adjustment must be a non-zero integer in micros");
  }
  if (Math.abs(input.micros) > MAX_ADMIN_CREDIT_ADJUSTMENT_MICROS) {
    throw invalid("Credit adjustment exceeds the USD 10,000 operator limit");
  }
  if (reason.length < 8 || reason.length > 500) {
    throw invalid("Adjustment reason must contain 8 to 500 characters");
  }
  if (!/^[A-Za-z0-9:_-]{8,100}$/.test(input.idempotencyKey)) {
    throw invalid("Invalid idempotency key");
  }

  const operationId = `admin:${input.idempotencyKey}`;
  return withTransaction(async (tx) => {
    const [target] = await tx
      .select({ id: schema.users.id, creditMicros: schema.users.creditMicros })
      .from(schema.users)
      .where(eq(schema.users.id, input.targetUserId))
      .limit(1);
    if (!target) throw invalid("Target user not found", 404, "not_found");

    const inserted = await tx
      .insert(schema.creditLedger)
      .values({
        id: id("led"),
        userId: input.targetUserId,
        type: "admin_adjustment",
        micros: input.micros,
        generationId: operationId,
        note: `Ajuste de plataforma: ${reason}`,
      })
      .onConflictDoNothing({
        target: [schema.creditLedger.generationId, schema.creditLedger.type],
      })
      .returning();

    if (!inserted.length) {
      const [existing] = await tx
        .select({ userId: schema.creditLedger.userId, micros: schema.creditLedger.micros })
        .from(schema.creditLedger)
        .where(
          and(
            eq(schema.creditLedger.generationId, operationId),
            eq(schema.creditLedger.type, "admin_adjustment"),
          ),
        )
        .limit(1);
      if (existing?.userId !== input.targetUserId || existing.micros !== input.micros) {
        throw invalid("Idempotency key was already used for a different adjustment", 409, "conflict");
      }
      const [current] = await tx
        .select({ creditMicros: schema.users.creditMicros })
        .from(schema.users)
        .where(eq(schema.users.id, input.targetUserId))
        .limit(1);
      return { applied: false, balanceMicros: current?.creditMicros ?? target.creditMicros };
    }

    const updated =
      input.micros > 0
        ? await tx
            .update(schema.users)
            .set({ creditMicros: sql`${schema.users.creditMicros} + ${input.micros}` })
            .where(eq(schema.users.id, input.targetUserId))
            .returning()
        : await tx
            .update(schema.users)
            .set({ creditMicros: sql`${schema.users.creditMicros} + ${input.micros}` })
            .where(
              and(
                eq(schema.users.id, input.targetUserId),
                gte(schema.users.creditMicros, Math.abs(input.micros)),
              ),
            )
            .returning();
    if (!updated.length) {
      throw invalid("Adjustment would make the customer wallet negative", 409, "insufficient_credits");
    }

    await tx.insert(schema.auditLogs).values({
      id: id("aud"),
      userId: input.actorUserId,
      action: "platform.credit_adjustment",
      resource: "user",
      resourceId: input.targetUserId,
      meta: {
        actorEmail: input.actorEmail,
        micros: input.micros,
        reason,
        idempotencyKey: input.idempotencyKey,
      },
    });
    return { applied: true, balanceMicros: updated[0].creditMicros };
  });
}
