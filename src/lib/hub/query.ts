import { and, eq, ilike, inArray, isNull, or, sql, type Column } from "drizzle-orm";
import type { AuthContext } from "@/lib/gateway/types";

/** SQL equivalent of hubTenantAccess. Workspace resources follow current membership. */
export function hubTenantScope(auth: AuthContext, user: Column, workspace: Column) {
  if (auth.workspaceId) {
    return auth.workspaceIds?.includes(auth.workspaceId)
      ? eq(workspace, auth.workspaceId)
      : sql`false`;
  }
  const personal = and(eq(user, auth.userId), isNull(workspace));
  return auth.workspaceIds?.length ? or(personal, inArray(workspace, auth.workspaceIds)) : personal;
}

export function hubNameMatches(query: string, title: Column, namespace: Column, slug: Column, ...fields: Column[]) {
  const pattern = `%${escapePattern(query)}%`;
  return or(
    ilike(title, pattern),
    ilike(sql`${namespace} || '/' || ${slug}`, pattern),
    ...fields.map((field) => ilike(field, pattern)),
  );
}

function escapePattern(query: string) {
  return query.replace(/[\\%_]/g, "\\$&");
}

export function hubNameRelevance(query: string, title: Column, namespace: Column, slug: Column) {
  const path = sql`${namespace} || '/' || ${slug}`;
  const prefix = `${escapePattern(query)}%`;
  return sql`case
    when lower(${path}) = lower(${query}) or lower(${title}) = lower(${query}) or lower(${slug}) = lower(${query}) then 3
    when ${path} ilike ${prefix} or ${title} ilike ${prefix} or ${slug} ilike ${prefix} then 2
    else 1
  end`;
}
