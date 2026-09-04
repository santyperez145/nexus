import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { findModel, resolveModelSlug } from "@/lib/catalog";
import { isTextModelExecutionReady } from "@/lib/catalog/presentation";
import { db, schema, withTransaction, type DbExecutor } from "@/lib/db";
import { resolveOwnedWorkspace, userScope } from "@/lib/gateway/tenant";
import type { AuthContext } from "@/lib/gateway/types";
import { id } from "@/lib/ids";
import { hubSlug, hubTenantAccess } from "./datasets";
import { ownedHubNamespace } from "./namespace-store";

type Space = typeof schema.hubSpaces.$inferSelect;
type Namespace = typeof schema.hubNamespaces.$inferSelect;
export type HubSpace = Space & {
  namespace: string;
  namespaceDisplayName: string;
  namespaceVerified: boolean;
};

type SpaceCreate = {
  namespace: string;
  slug: string;
  title: string;
  description: string;
  visibility: "public" | "private";
  model: string;
  system_prompt: string;
  starter_prompt?: string | null;
  temperature: number;
  max_tokens: number;
  workspace_id?: string | null;
};

type SpacePatch = Partial<{
  title: string;
  description: string;
  visibility: "public" | "private";
  model: string;
  system_prompt: string;
  starter_prompt: string | null;
  temperature: number;
  max_tokens: number;
}>;

function notFound() {
  return Object.assign(new Error("space not found"), { status: 404, code: "not_found" });
}

function forbidden() {
  return Object.assign(new Error("space write access required"), { status: 403, code: "forbidden" });
}

function conflict(message: string) {
  return Object.assign(new Error(message), { status: 409, code: "conflict" });
}

function combine(space: Space, namespace: Namespace): HubSpace {
  return {
    ...space,
    namespace: namespace.slug,
    namespaceDisplayName: namespace.displayName,
    namespaceVerified: namespace.verified,
  };
}

export function resolveExecutableSpaceModel(value: string) {
  const resolved = resolveModelSlug(value);
  const model = findModel(resolved);
  if (!model || !isTextModelExecutionReady(model)) {
    throw Object.assign(new Error("space model is not an executable text model"), {
      status: 400,
      code: "model_not_found",
    });
  }
  return resolved;
}

export function publicSpace(space: HubSpace) {
  return {
    id: space.id,
    namespace: space.namespace,
    namespace_name: space.namespaceDisplayName,
    namespace_verified: space.namespaceVerified,
    slug: space.slug,
    path: `${space.namespace}/${space.slug}`,
    title: space.title,
    description: space.description,
    visibility: space.visibility,
    model: space.model,
    system_prompt: space.systemPrompt,
    starter_prompt: space.starterPrompt,
    temperature: space.temperatureMilli / 1_000,
    max_tokens: space.maxTokens,
    runs: space.runs,
    created_at: space.createdAt,
    updated_at: space.updatedAt,
  };
}

export async function findHubSpace(
  namespaceValue: string,
  slugValue: string,
  executor: DbExecutor = db,
) {
  const namespace = hubSlug(namespaceValue, "namespace");
  const slug = hubSlug(slugValue, "space");
  const [row] = await executor
    .select({ space: schema.hubSpaces, namespace: schema.hubNamespaces })
    .from(schema.hubSpaces)
    .innerJoin(schema.hubNamespaces, eq(schema.hubNamespaces.id, schema.hubSpaces.namespaceId))
    .where(and(eq(schema.hubNamespaces.slug, namespace), eq(schema.hubSpaces.slug, slug)))
    .limit(1);
  return row ? combine(row.space, row.namespace) : null;
}

export function canReadHubSpace(space: HubSpace, auth: AuthContext | null) {
  return space.visibility === "public" || hubTenantAccess(auth, space);
}

/** Private workspace execution requires an explicitly workspace-scoped API key.
 * Browser sessions may use their assigned tenant memberships; public Spaces are runnable by any account.
 */
export function canExecuteHubSpace(space: HubSpace, auth: AuthContext) {
  if (space.visibility === "public") return true;
  if (auth.apiKeyId && space.workspaceId) {
    return space.workspaceId === auth.workspaceId && Boolean(auth.workspaceIds?.includes(space.workspaceId));
  }
  return hubTenantAccess(auth, space);
}

export async function listHubSpaces(input: {
  auth?: AuthContext | null;
  mine?: boolean;
  query?: string;
  model?: string;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(input.limit ?? 50, 100));
  const search = input.query?.trim().slice(0, 120);
  const base = input.mine
    ? input.auth
      ? userScope(input.auth, schema.hubSpaces.userId, schema.hubSpaces.workspaceId)
      : sql`false`
    : eq(schema.hubSpaces.visibility, "public");
  const where = search
    ? and(
        base,
        or(
          ilike(schema.hubSpaces.title, `%${search}%`),
          ilike(schema.hubSpaces.slug, `%${search}%`),
          ilike(schema.hubNamespaces.slug, `%${search}%`),
          ilike(schema.hubSpaces.model, `%${search}%`),
        ),
      )
    : base;
  const rows = await db
    .select({ space: schema.hubSpaces, namespace: schema.hubNamespaces })
    .from(schema.hubSpaces)
    .innerJoin(schema.hubNamespaces, eq(schema.hubNamespaces.id, schema.hubSpaces.namespaceId))
    .where(where)
    .orderBy(desc(schema.hubSpaces.updatedAt))
    .limit(200);
  return rows
    .map((row) => combine(row.space, row.namespace))
    .filter((space) => !input.model || space.model === input.model)
    .slice(0, limit);
}

export async function createHubSpace(auth: AuthContext, input: SpaceCreate) {
  const workspaceId = await resolveOwnedWorkspace(auth, input.workspace_id);
  const namespaceSlug = hubSlug(input.namespace, "namespace");
  const spaceSlug = hubSlug(input.slug, "space");
  const model = resolveExecutableSpaceModel(input.model);
  try {
    return await withTransaction(async (tx) => {
      const namespace = await ownedHubNamespace(
        tx,
        auth,
        namespaceSlug,
        input.namespace.trim(),
        workspaceId,
      );
      const row = {
        id: id("space"),
        namespaceId: namespace.id,
        userId: auth.userId,
        workspaceId,
        slug: spaceSlug,
        title: input.title,
        description: input.description,
        visibility: input.visibility,
        model,
        systemPrompt: input.system_prompt,
        starterPrompt: input.starter_prompt || null,
        temperatureMilli: Math.round(input.temperature * 1_000),
        maxTokens: input.max_tokens,
      };
      await tx.insert(schema.hubSpaces).values(row);
      return combine(
        { ...row, runs: 0, createdAt: new Date(), updatedAt: new Date() },
        namespace,
      );
    });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "conflict") throw error;
    if (/unique|duplicate/i.test(error instanceof Error ? error.message : "")) {
      throw conflict("space path already exists");
    }
    throw error;
  }
}

export async function assertHubSpaceMutation(auth: AuthContext, namespace: string, slug: string) {
  const space = await findHubSpace(namespace, slug);
  if (!space) throw notFound();
  if (!hubTenantAccess(auth, space)) throw forbidden();
  return space;
}

export async function updateHubSpace(
  auth: AuthContext,
  namespace: string,
  slug: string,
  patch: SpacePatch,
) {
  const space = await assertHubSpaceMutation(auth, namespace, slug);
  await db
    .update(schema.hubSpaces)
    .set({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.visibility !== undefined ? { visibility: patch.visibility } : {}),
      ...(patch.model !== undefined ? { model: resolveExecutableSpaceModel(patch.model) } : {}),
      ...(patch.system_prompt !== undefined ? { systemPrompt: patch.system_prompt } : {}),
      ...(patch.starter_prompt !== undefined ? { starterPrompt: patch.starter_prompt || null } : {}),
      ...(patch.temperature !== undefined
        ? { temperatureMilli: Math.round(patch.temperature * 1_000) }
        : {}),
      ...(patch.max_tokens !== undefined ? { maxTokens: patch.max_tokens } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.hubSpaces.id, space.id));
  return findHubSpace(namespace, slug);
}

export async function deleteHubSpace(auth: AuthContext, namespace: string, slug: string) {
  const space = await assertHubSpaceMutation(auth, namespace, slug);
  await db.delete(schema.hubSpaces).where(eq(schema.hubSpaces.id, space.id));
  return space;
}

export async function recordHubSpaceRun(
  auth: AuthContext,
  space: HubSpace,
  generationId: string,
) {
  await withTransaction(async (tx) => {
    await tx.insert(schema.hubSpaceRuns).values({
      id: id("space_run"),
      spaceId: space.id,
      userId: auth.userId,
      workspaceId: auth.workspaceId ?? null,
      generationId,
      model: space.model,
    });
    await tx
      .update(schema.hubSpaces)
      .set({ runs: sql`${schema.hubSpaces.runs} + 1` })
      .where(eq(schema.hubSpaces.id, space.id));
  });
}

export async function listHubSpaceRuns(auth: AuthContext, namespace: string, slug: string) {
  const space = await assertHubSpaceMutation(auth, namespace, slug);
  return db
    .select({
      id: schema.hubSpaceRuns.id,
      generationId: schema.hubSpaceRuns.generationId,
      model: schema.hubSpaceRuns.model,
      createdAt: schema.hubSpaceRuns.createdAt,
    })
    .from(schema.hubSpaceRuns)
    .where(eq(schema.hubSpaceRuns.spaceId, space.id))
    .orderBy(desc(schema.hubSpaceRuns.createdAt))
    .limit(100);
}
