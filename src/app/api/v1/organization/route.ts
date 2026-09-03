import { and, eq, isNull } from "drizzle-orm";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { db, schema } from "@/lib/db";
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
      await db.insert(schema.organizationMembers).values({
        id: id("om"),
        organizationId: invite.organizationId,
        userId: auth.userId,
        role: invite.role,
      });
      await db
        .update(schema.organizationInvites)
        .set({ acceptedAt: new Date() })
        .where(eq(schema.organizationInvites.id, invite.id));
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
      const role = normalizeInviteRole(body.role, isOwner);
      if (!role) {
        return jsonError(Object.assign(new Error("invalid role"), { status: 400 }));
      }
      const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
      if (user) {
        await db.insert(schema.organizationMembers).values({
          id: id("om"),
          organizationId: org.id,
          userId: user.id,
          role,
        });
        return Response.json({
          data: { organization_id: org.id, user_id: user.id, email: user.email, status: "joined" },
        });
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
      await db.insert(schema.organizationInvites).values(invite);
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

export async function DELETE(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const orgId = new URL(req.url).searchParams.get("id");
    if (!orgId) return jsonError(Object.assign(new Error("id required"), { status: 400 }));
    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId)).limit(1);
    if (!org || org.ownerId !== auth.userId) {
      return jsonError(Object.assign(new Error("not found"), { status: 404 }));
    }
    await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
    return Response.json({ data: { success: true } });
  } catch (error) {
    return jsonError(error);
  }
}
