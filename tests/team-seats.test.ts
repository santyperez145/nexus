import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";

const dataDir = mkdtempSync(join(tmpdir(), "nexus-team-seats-test-"));
process.env.ENABLE_PGLITE = "true";
process.env.PGLITE_DATA_DIR = dataDir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.POSTGRES_PRISMA_URL;

let database: typeof import("../src/lib/db");
let seats: typeof import("../src/lib/orgs/seats");
const ownerToken = "sk-nx-mgmt-team-owner-test";
const staleToken = "sk-nx-mgmt-team-stale-test";
const inviteOwnerToken = "sk-nx-mgmt-team-invite-test";

before(async () => {
  database = await import("../src/lib/db");
  seats = await import("../src/lib/orgs/seats");
  const { sha256 } = await import("../src/lib/crypto");
  await database.ensureDb();
  await database.db.insert(database.schema.users).values([
    { id: "usr_seat_owner", name: "Owner", email: "owner@seats.test", plan: "team" },
    { id: "usr_seat_member", name: "Member", email: "member@seats.test" },
    { id: "usr_stale_team", name: "Stale", email: "stale@seats.test", plan: "team" },
    { id: "usr_invite_owner", name: "Invite owner", email: "invite-owner@seats.test", plan: "team" },
  ]);
  await database.db.insert(database.schema.subscriptions).values([
    {
      id: "sub_seat_team",
      userId: "usr_seat_owner",
      customerId: "cus_seat_owner",
      plan: "team",
      status: "active",
      quantity: 2,
    },
    {
      id: "sub_invite_team",
      userId: "usr_invite_owner",
      customerId: "cus_invite_owner",
      plan: "team",
      status: "active",
      quantity: 2,
    },
  ]);
  await database.db.insert(database.schema.apiKeys).values([
    {
      id: "key_seat_owner",
      userId: "usr_seat_owner",
      name: "Team owner",
      keyHash: sha256(ownerToken),
      keyPrefix: "sk-nx-mgmt-team-owner",
      isManagement: true,
    },
    {
      id: "key_seat_stale",
      userId: "usr_stale_team",
      name: "Stale Team owner",
      keyHash: sha256(staleToken),
      keyPrefix: "sk-nx-mgmt-team-stale",
      isManagement: true,
    },
    {
      id: "key_invite_owner",
      userId: "usr_invite_owner",
      name: "Invite owner",
      keyHash: sha256(inviteOwnerToken),
      keyPrefix: "sk-nx-mgmt-team-invite",
      isManagement: true,
    },
  ]);
  await database.db.insert(database.schema.organizations).values([
    { id: "org_seat_a", name: "A", slug: "seat-a", ownerId: "usr_seat_owner" },
    { id: "org_seat_b", name: "B", slug: "seat-b", ownerId: "usr_seat_owner" },
    { id: "org_invite", name: "Invite org", slug: "invite-org", ownerId: "usr_invite_owner" },
  ]);
  await database.db.insert(database.schema.organizationMembers).values([
    { id: "om_owner_a", organizationId: "org_seat_a", userId: "usr_seat_owner", role: "owner" },
    { id: "om_owner_b", organizationId: "org_seat_b", userId: "usr_seat_owner", role: "owner" },
    { id: "om_member_a", organizationId: "org_seat_a", userId: "usr_seat_member", role: "member" },
    { id: "om_member_b", organizationId: "org_seat_b", userId: "usr_seat_member", role: "admin" },
    { id: "om_invite_owner", organizationId: "org_invite", userId: "usr_invite_owner", role: "owner" },
  ]);
});

after(() => rmSync(dataDir, { recursive: true, force: true }));

describe("Team seat pool", () => {
  it("counts unique people across every organization owned by the billing account", async () => {
    const usage = await seats.teamSeatUsageForOwner("usr_seat_owner");
    assert.equal(usage.capacity, 2);
    assert.equal(usage.used, 2);
    assert.deepEqual(new Set(usage.memberUserIds), new Set(["usr_seat_owner", "usr_seat_member"]));
    assert.equal(seats.canAllocateTeamSeat(usage, { userId: "usr_seat_member" }), true);
    assert.equal(seats.canAllocateTeamSeat(usage, { email: "new@seats.test" }), false);
  });

  it("deduplicates live pending emails and ignores expired invitations", async () => {
    const now = new Date("2026-09-03T12:00:00.000Z");
    await database.db.insert(database.schema.organizationInvites).values([
      {
        id: "oi_live_a",
        organizationId: "org_seat_a",
        email: "pending@seats.test",
        role: "member",
        token: "nxi_live_a",
        invitedBy: "usr_seat_owner",
        expiresAt: new Date("2026-09-04T12:00:00.000Z"),
      },
      {
        id: "oi_live_b",
        organizationId: "org_seat_b",
        email: "PENDING@seats.test",
        role: "member",
        token: "nxi_live_b",
        invitedBy: "usr_seat_owner",
        expiresAt: new Date("2026-09-04T12:00:00.000Z"),
      },
      {
        id: "oi_expired",
        organizationId: "org_seat_a",
        email: "expired@seats.test",
        role: "member",
        token: "nxi_expired",
        invitedBy: "usr_seat_owner",
        expiresAt: new Date("2026-09-02T12:00:00.000Z"),
      },
    ]);
    const usage = await seats.teamSeatUsageForOwner("usr_seat_owner", database.db, now);
    assert.equal(usage.used, 3);
    assert.deepEqual(usage.pendingEmails, ["pending@seats.test"]);
  });

  it("uses the active subscription as authority and supports a transactional account lock", async () => {
    const stale = await seats.teamSeatUsageForOwner("usr_stale_team");
    assert.equal(stale.capacity, 0);
    await database.withTransaction(async (tx) => {
      await seats.lockTeamSeatAccount(tx, "usr_seat_owner");
    });
  });

  it("creates the organization and owner membership atomically from subscription truth", async () => {
    const { POST } = await import("../src/app/api/v1/organization/route");
    const response = await POST(
      new Request("https://nexus.test/api/v1/organization", {
        method: "POST",
        headers: {
          authorization: `Bearer ${ownerToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "Atomic Team", slug: "atomic-team" }),
      }),
    );
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { data: { id: string } };
    const [membership] = await database.db
      .select()
      .from(database.schema.organizationMembers)
      .where(
        and(
          eq(database.schema.organizationMembers.organizationId, payload.data.id),
          eq(database.schema.organizationMembers.userId, "usr_seat_owner"),
        ),
      )
      .limit(1);
    assert.equal(membership?.role, "owner");
  });

  it("rejects organization creation when the local plan is stale", async () => {
    const { POST } = await import("../src/app/api/v1/organization/route");
    const response = await POST(
      new Request("https://nexus.test/api/v1/organization", {
        method: "POST",
        headers: {
          authorization: `Bearer ${staleToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "No Subscription", slug: "no-subscription" }),
      }),
    );
    assert.equal(response.status, 403);
    const [organization] = await database.db
      .select()
      .from(database.schema.organizations)
      .where(eq(database.schema.organizations.slug, "no-subscription"))
      .limit(1);
    assert.equal(organization, undefined);
  });

  it("keeps an invitation usable and reports when email delivery is unavailable", async () => {
    const { POST } = await import("../src/app/api/v1/organization/route");
    const env = process.env as Record<string, string | undefined>;
    const previousKey = env.RESEND_API_KEY;
    const previousFrom = env.EMAIL_FROM;
    delete env.RESEND_API_KEY;
    delete env.EMAIL_FROM;
    try {
      const response = await POST(
        new Request("https://nexus.test/api/v1/organization", {
          method: "POST",
          headers: {
            authorization: `Bearer ${inviteOwnerToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            organization_id: "org_invite",
            invite_email: "pending-invite@seats.test",
            role: "member",
          }),
        }),
      );
      assert.equal(response.status, 200);
      const payload = (await response.json()) as {
        data: {
          status: string;
          email_delivery: string;
          accept_url: string;
        };
      };
      assert.equal(payload.data.status, "pending");
      assert.equal(payload.data.email_delivery, "unavailable");
      assert.match(payload.data.accept_url, /\/settings\/organizations\?invite=nxi_/);
    } finally {
      if (previousKey === undefined) delete env.RESEND_API_KEY;
      else env.RESEND_API_KEY = previousKey;
      if (previousFrom === undefined) delete env.EMAIL_FROM;
      else env.EMAIL_FROM = previousFrom;
    }
    const [pending] = await database.db
      .select()
      .from(database.schema.organizationInvites)
      .where(
        and(
          eq(database.schema.organizationInvites.organizationId, "org_invite"),
          eq(database.schema.organizationInvites.email, "pending-invite@seats.test"),
        ),
      )
      .limit(1);
    assert.equal(pending?.acceptedAt, null);
  });
});
