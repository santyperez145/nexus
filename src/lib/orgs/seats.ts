import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db, schema, type DbExecutor } from "@/lib/db";

export type TeamSeatUsage = {
  ownerId: string;
  capacity: number;
  used: number;
  memberUserIds: string[];
  memberEmails: string[];
  pendingEmails: string[];
};

export async function teamSeatUsageForOwner(
  ownerId: string,
  executor: DbExecutor = db,
  now = new Date(),
): Promise<TeamSeatUsage> {
  const [subscription] = await executor
    .select({ quantity: schema.subscriptions.quantity })
    .from(schema.subscriptions)
    .where(
      and(
        eq(schema.subscriptions.userId, ownerId),
        eq(schema.subscriptions.plan, "team"),
        inArray(schema.subscriptions.status, ["active", "trialing"]),
      ),
    )
    .orderBy(desc(schema.subscriptions.updatedAt))
    .limit(1);
  const members = await executor
    .select({ userId: schema.organizationMembers.userId, email: schema.users.email })
    .from(schema.organizationMembers)
    .innerJoin(
      schema.organizations,
      eq(schema.organizations.id, schema.organizationMembers.organizationId),
    )
    .innerJoin(schema.users, eq(schema.users.id, schema.organizationMembers.userId))
    .where(eq(schema.organizations.ownerId, ownerId));
  const invites = await executor
    .select({ email: schema.organizationInvites.email })
    .from(schema.organizationInvites)
    .innerJoin(
      schema.organizations,
      eq(schema.organizations.id, schema.organizationInvites.organizationId),
    )
    .where(
      and(
        eq(schema.organizations.ownerId, ownerId),
        isNull(schema.organizationInvites.acceptedAt),
        gt(schema.organizationInvites.expiresAt, now),
      ),
    );

  const memberUserIds = [...new Set(members.map((member) => member.userId))];
  const memberEmails = [...new Set(members.map((member) => member.email.toLowerCase()))];
  const memberEmailSet = new Set(memberEmails);
  const pendingEmails = [
    ...new Set(
      invites
        .map((invite) => invite.email.toLowerCase())
        .filter((email) => !memberEmailSet.has(email)),
    ),
  ];
  return {
    ownerId,
    capacity: Math.max(0, subscription?.quantity ?? 0),
    used: memberUserIds.length + pendingEmails.length,
    memberUserIds,
    memberEmails,
    pendingEmails,
  };
}

export function identityAlreadyHasSeat(
  usage: TeamSeatUsage,
  identity: { userId?: string | null; email?: string | null },
) {
  const email = identity.email?.trim().toLowerCase();
  return Boolean(
    (identity.userId && usage.memberUserIds.includes(identity.userId)) ||
      (email && (usage.memberEmails.includes(email) || usage.pendingEmails.includes(email))),
  );
}

export function canAllocateTeamSeat(
  usage: TeamSeatUsage,
  identity: { userId?: string | null; email?: string | null },
) {
  return usage.capacity > 0 &&
    (identityAlreadyHasSeat(usage, identity) || usage.used < usage.capacity);
}

export async function lockTeamSeatAccount(executor: DbExecutor, ownerId: string) {
  await executor.execute(sql`SELECT id FROM "user" WHERE id = ${ownerId} FOR UPDATE`);
}
