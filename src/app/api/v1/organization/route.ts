import { eq } from "drizzle-orm";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { db, schema } from "@/lib/db";
import { id } from "@/lib/ids";
import { slugify } from "@/lib/slug";

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
    if (body.invite_email && body.organization_id) {
      const [org] = await db
        .select()
        .from(schema.organizations)
        .where(eq(schema.organizations.id, body.organization_id))
        .limit(1);
      if (!org || org.ownerId !== auth.userId) {
        return jsonError(Object.assign(new Error("not found"), { status: 404 }));
      }
      const email = String(body.invite_email).trim().toLowerCase();
      const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
      if (!user) {
        return jsonError(Object.assign(new Error("user not found"), { status: 404 }));
      }
      await db.insert(schema.organizationMembers).values({
        id: id("om"),
        organizationId: org.id,
        userId: user.id,
        role: body.role ?? "member",
      });
      return Response.json({ data: { organization_id: org.id, user_id: user.id, email: user.email } });
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
