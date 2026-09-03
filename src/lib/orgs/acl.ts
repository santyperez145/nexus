const MANAGE_ROLES = new Set(["owner", "admin"]);
const INVITE_ROLES = new Set(["member", "admin"]);

export function canManageOrg(isOwner: boolean, memberRole?: string | null) {
  return isOwner || MANAGE_ROLES.has(memberRole ?? "");
}

export function normalizeInviteRole(raw: unknown, actorIsOwner: boolean) {
  const role = String(raw ?? "member").trim().toLowerCase();
  if (role === "owner") return actorIsOwner ? "owner" : null;
  if (INVITE_ROLES.has(role)) return role;
  return null;
}
