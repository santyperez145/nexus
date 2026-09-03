import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { db, schema, withTransaction } from "@/lib/db";
import { APP_URL } from "@/lib/config";
import { sendMail } from "@/lib/email";
import { id } from "@/lib/ids";
import { canManageOrg, normalizeInviteRole } from "@/lib/orgs/acl";
import { slugify } from "@/lib/slug";
import { randomKey } from "@/lib/crypto";

async function membersOf(organizationId: string) {
  const rows = await db
    .select({
      id: schema.organizationMembers.id,
      userId: schema.organizationMembers.userId,
      role: schema.organizationMembers.role,
      email: schema.users.email,
      name: schema.users.name,
    })
    .from(schema.organizationMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.organizationMembers.userId))
    .where(eq(schema.organizationMembers.organizationId, organizationId));
  return rows;
}

async function pendingInvites(organizationId: string) {
  return db
    .select({
      id: schema.organizationInvites.id,
      email: schema.organizationInvites.email,
      role: schema.organizationInvites.role,
      expiresAt: schema.organizationInvites.expiresAt,
      acceptedAt: schema.organizationInvites.acceptedAt,
    })
    .from(schema.organizationInvites)
    .where(
      and(
        eq(schema.organizationInvites.organizationId, organizationId),
        isNull(schema.organizationInvites.acceptedAt),
      ),
    );
}

async function teamSeats(organizationId: string) {
  const [organization] = await db
    .select({ ownerId: schema.organizations.ownerId, plan: schema.users.plan })
    .from(schema.organizations)
    .innerJoin(schema.users, eq(schema.users.id, schema.organizations.ownerId))
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);
  if (!organization || organization.plan !== "team") return { capacity: 0, used: 0 };
  const subscriptions = await db
    .select({ quantity: schema.subscriptions.quantity, status: schema.subscriptions.status })
    .from(schema.subscriptions)
    .where(and(eq(schema.subscriptions.userId, organization.ownerId), eq(schema.subscriptions.plan, "team")))
    .orderBy(desc(schema.subscriptions.updatedAt));
  const active = subscriptions.find((row) => row.status === "active" || row.status === "trialing");
  const members = await membersOf(organizationId);
  const invites = await pendingInvites(organizationId);
  return { capacity: active?.quantity ?? 0, used: members.length + invites.length };
}

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const owned = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.ownerId, auth.userId));
    const memberships = await db
      .select()
      .from(schema.organizationMembers)
      .where(eq(schema.organizationMembers.userId, auth.userId));
    const ids = new Set([...owned.map((o) => o.id), ...memberships.map((m) => m.organizationId)]);
    const orgs = [];
    for (const orgId of ids) {
      const [org] = await db
        .select()
        .from(schema.organizations)
        .where(eq(schema.organizations.id, orgId))
        .limit(1);
      if (!org) continue;
      const mine = memberships.find((m) => m.organizationId === org.id);
      orgs.push({
        ...org,
        role: mine?.role ?? (org.ownerId === auth.userId ? "owner" : "member"),
        members: await membersOf(org.id),
        pending_invites: await pendingInvites(org.id),
      });
    }
    return Response.json({ data: orgs });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const body = await req.json();

    if (body.accept_token) {
      const [invite] = await db
        .select()
        .from(schema.organizationInvites)
        .where(eq(schema.organizationInvites.token, String(body.accept_token)))
        .limit(1);
      if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
        return jsonError(Object.assign(new Error("invite invalid or expired"), { status: 400 }));
      }
      const [user] = await db.select().from(schema.users).where(eq(schema.users.id, auth.userId)).limit(1);
      if (!user || user.email.toLowerCase() !== invite.email.toLowerCase()) {
        return jsonError(Object.assign(new Error("invite email mismatch"), { status: 403 }));
      }
      const seats = await teamSeats(invite.organizationId);
      if (seats.capacity <= 0 || seats.used > seats.capacity) {
        return jsonError(
          Object.assign(new Error("The organization does not have an available active Team seat"), {
            status: 403,
            code: "plan_limit",
          }),
        );
      }
      await withTransaction(async (tx) => {
        const [claimed] = await tx
          .update(schema.organizationInvites)
          .set({ acceptedAt: new Date() })
          .where(
            and(
              eq(schema.organizationInvites.id, invite.id),
              isNull(schema.organizationInvites.acceptedAt),
              gt(schema.organizationInvites.expiresAt, new Date()),
            ),
          )
          .returning();
        if (!claimed) {
          throw Object.assign(new Error("invite invalid or already accepted"), {
            status: 400,
            code: "invalid_invite",
          });
        }
        await tx
          .insert(schema.organizationMembers)
          .values({
            id: id("om"),
            organizationId: invite.organizationId,
            userId: auth.userId,
            role: invite.role,
          })
          .onConflictDoNothing({
            target: [schema.organizationMembers.organizationId, schema.organizationMembers.userId],
          });
        const defaultWorkspaces = await tx
          .select({ id: schema.workspaces.id })
          .from(schema.workspaces)
          .where(
            and(
              eq(schema.workspaces.organizationId, invite.organizationId),
              eq(schema.workspaces.isDefault, true),
            ),
          );
        if (defaultWorkspaces.length) {
          await tx
            .insert(schema.workspaceMembers)
            .values(
              defaultWorkspaces.map((workspace) => ({
                id: id("wsm"),
                workspaceId: workspace.id,
                userId: auth.userId,
              })),
            )
            .onConflictDoNothing({
              target: [schema.workspaceMembers.workspaceId, schema.workspaceMembers.userId],
            });
        }
      });
      return Response.json({ data: { organization_id: invite.organizationId, role: invite.role } });
    }

    if (body.invite_email && body.organization_id) {
      const [org] = await db
        .select()
        .from(schema.organizations)
        .where(eq(schema.organizations.id, body.organization_id))
        .limit(1);
      const [membership] = org
        ? await db
            .select({ role: schema.organizationMembers.role })
            .from(schema.organizationMembers)
            .where(
              and(
                eq(schema.organizationMembers.organizationId, org.id),
                eq(schema.organizationMembers.userId, auth.userId),
              ),
            )
            .limit(1)
        : [];
      const isOwner = Boolean(org && org.ownerId === auth.userId);
      if (!org || !canManageOrg(isOwner, membership?.role)) {
        return jsonError(Object.assign(new Error("not found"), { status: 404 }));
      }
      const email = String(body.invite_email).trim().toLowerCase();
      const role = normalizeInviteRole(body.role);
      if (!role) {
        return jsonError(Object.assign(new Error("invalid role"), { status: 400 }));
      }
      const seats = await teamSeats(org.id);
      if (seats.capacity <= 0) {
        return jsonError(
          Object.assign(new Error("An active Team subscription is required to invite members"), {
            status: 403,
            code: "plan_required",
          }),
        );
      }
      const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
      if (user) {
        const [existing] = await db
          .select()
          .from(schema.organizationMembers)
          .where(
            and(
              eq(schema.organizationMembers.organizationId, org.id),
              eq(schema.organizationMembers.userId, user.id),
            ),
          )
          .limit(1);
        if (existing) {
          return Response.json({ data: { organization_id: org.id, user_id: user.id, status: "already_member" } });
        }
        if (seats.used >= seats.capacity) {
          return jsonError(Object.assign(new Error("Team seat limit reached; add seats in Billing"), { status: 403, code: "plan_limit" }));
        }
        await withTransaction(async (tx) => {
          await tx
            .insert(schema.organizationMembers)
            .values({ id: id("om"), organizationId: org.id, userId: user.id, role });
          const defaultWorkspaces = await tx
            .select({ id: schema.workspaces.id })
            .from(schema.workspaces)
            .where(
              and(
                eq(schema.workspaces.organizationId, org.id),
                eq(schema.workspaces.isDefault, true),
              ),
            );
          if (defaultWorkspaces.length) {
            await tx
              .insert(schema.workspaceMembers)
              .values(
                defaultWorkspaces.map((workspace) => ({
                  id: id("wsm"),
                  workspaceId: workspace.id,
                  userId: user.id,
                })),
              )
              .onConflictDoNothing({
                target: [schema.workspaceMembers.workspaceId, schema.workspaceMembers.userId],
              });
          }
        });
        return Response.json({
          data: { organization_id: org.id, user_id: user.id, email: user.email, status: "joined" },
        });
      }
      const [existingInvite] = await db
        .select()
        .from(schema.organizationInvites)
        .where(
          and(
            eq(schema.organizationInvites.organizationId, org.id),
            eq(schema.organizationInvites.email, email),
            isNull(schema.organizationInvites.acceptedAt),
          ),
        )
        .limit(1);
      if (!existingInvite && seats.used >= seats.capacity) {
        return jsonError(Object.assign(new Error("Team seat limit reached; add seats in Billing"), { status: 403, code: "plan_limit" }));
      }
      const token = randomKey("nxi_", 24);
      const invite = {
        id: id("oi"),
        organizationId: org.id,
        email,
        role,
        token,
        invitedBy: auth.userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };
      await db
        .insert(schema.organizationInvites)
        .values(invite)
        .onConflictDoUpdate({
          target: [schema.organizationInvites.organizationId, schema.organizationInvites.email],
          set: { role, token, invitedBy: auth.userId, acceptedAt: null, expiresAt: invite.expiresAt },
        });
      const acceptUrl = `${APP_URL}/settings/organizations?invite=${token}`;
      await sendMail({
        to: email,
        subject: `Invitación a ${org.name} · Nexus`,
        text: [
          `Te invitaron a la org "${org.name}" en Nexus.`,
          `Registrate o iniciá sesión con ${email} y abrí:`,
          acceptUrl,
          `O aceptá con POST /api/v1/organization { "accept_token": "${token}" }`,
        ].join("\n"),
      });
      return Response.json({
        data: {
          organization_id: org.id,
          email,
          status: "pending",
          expires_at: invite.expiresAt.toISOString(),
          accept_url: acceptUrl,
        },
      });
    }

    if (auth.plan !== "team") {
      return jsonError(
        Object.assign(new Error("Team plan required to create organizations"), {
          status: 403,
          code: "plan_required",
        }),
      );
    }
    const row = {
      id: id("org"),
      name: body.name ?? "Organization",
      slug: slugify(String(body.slug ?? body.name ?? "org"), "org"),
      ownerId: auth.userId,
    };
    await db.insert(schema.organizations).values(row);
    await db.insert(schema.organizationMembers).values({
      id: id("om"),
      organizationId: row.id,
      userId: auth.userId,
      role: "owner",
    });
    return Response.json({ data: row });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const body = await req.json();
    const orgId = String(body.organization_id ?? "");
    const memberId = String(body.member_id ?? "");
    if (!orgId || !memberId) {
      return jsonError(Object.assign(new Error("organization_id and member_id required"), { status: 400 }));
    }
    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId)).limit(1);
    const [actor] = org
      ? await db
          .select({ role: schema.organizationMembers.role })
          .from(schema.organizationMembers)
          .where(and(eq(schema.organizationMembers.organizationId, orgId), eq(schema.organizationMembers.userId, auth.userId)))
          .limit(1)
      : [];
    if (!org || !canManageOrg(org.ownerId === auth.userId, actor?.role)) {
      return jsonError(Object.assign(new Error("not found"), { status: 404 }));
    }
    const [member] = await db
      .select()
      .from(schema.organizationMembers)
      .where(and(eq(schema.organizationMembers.id, memberId), eq(schema.organizationMembers.organizationId, orgId)))
      .limit(1);
    if (!member || member.userId === org.ownerId) {
      return jsonError(Object.assign(new Error("owner role cannot be changed"), { status: 403 }));
    }
    const role = normalizeInviteRole(body.role);
    if (!role) return jsonError(Object.assign(new Error("invalid role"), { status: 400 }));
    await db.update(schema.organizationMembers).set({ role }).where(eq(schema.organizationMembers.id, member.id));
    return Response.json({ data: { id: member.id, role } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const url = new URL(req.url);
    const orgId = url.searchParams.get("organization_id") ?? url.searchParams.get("id");
    if (!orgId) return jsonError(Object.assign(new Error("id required"), { status: 400 }));
    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId)).limit(1);
    const memberId = url.searchParams.get("member_id");
    if (memberId && org) {
      const [actor] = await db
        .select({ role: schema.organizationMembers.role })
        .from(schema.organizationMembers)
        .where(and(eq(schema.organizationMembers.organizationId, orgId), eq(schema.organizationMembers.userId, auth.userId)))
        .limit(1);
      if (!canManageOrg(org.ownerId === auth.userId, actor?.role)) {
        return jsonError(Object.assign(new Error("not found"), { status: 404 }));
      }
      const [member] = await db
        .select()
        .from(schema.organizationMembers)
        .where(and(eq(schema.organizationMembers.id, memberId), eq(schema.organizationMembers.organizationId, orgId)))
        .limit(1);
      if (!member || member.userId === org.ownerId) {
        return jsonError(Object.assign(new Error("owner cannot be removed"), { status: 403 }));
      }
      const workspaceIds = await db
        .select({ id: schema.workspaces.id })
        .from(schema.workspaces)
        .where(eq(schema.workspaces.organizationId, orgId));
      await withTransaction(async (tx) => {
        if (workspaceIds.length) {
          await tx
            .delete(schema.workspaceMembers)
            .where(
              and(
                eq(schema.workspaceMembers.userId, member.userId),
                inArray(
                  schema.workspaceMembers.workspaceId,
                  workspaceIds.map((workspace) => workspace.id),
                ),
              ),
            );
        }
        await tx.delete(schema.organizationMembers).where(eq(schema.organizationMembers.id, member.id));
      });
      return Response.json({ data: { id: member.id, deleted: true } });
    }
    if (!org || org.ownerId !== auth.userId) {
      return jsonError(Object.assign(new Error("not found"), { status: 404 }));
    }
    await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
    return Response.json({ data: { success: true } });
  } catch (error) {
    return jsonError(error);
  }
}
