import { and, eq, type Column, type SQL } from "drizzle-orm";
import type { AuthContext } from "./types";

/** Key/workspace scoped row access. Session without workspace sees the whole user. */
export function canAccess(
  auth: AuthContext,
  row: { userId: string; workspaceId?: string | null },
) {
  if (row.userId !== auth.userId) return false;
  if (!auth.workspaceId) return true;
  return row.workspaceId === auth.workspaceId;
}

export function userScope(
  auth: AuthContext,
  userCol: Column,
  workspaceCol?: Column,
): SQL | undefined {
  if (auth.workspaceId && workspaceCol) {
    return and(eq(userCol, auth.userId), eq(workspaceCol, auth.workspaceId));
  }
  return eq(userCol, auth.userId);
}
