import type { AuthContext } from "@/lib/gateway/types";

export function shouldRetainPayloads(
  auth: Pick<AuthContext, "logPrompts" | "zdr">,
  requestRequiresZdr = false,
) {
  return auth.logPrompts && !auth.zdr && !requestRequiresZdr;
}

export function assertVideoRetentionCompatible(auth: Pick<AuthContext, "zdr">) {
  if (!auth.zdr) return;
  throw Object.assign(
    new Error("Video is unavailable in ZDR mode because asynchronous jobs require retained polling state"),
    { status: 400, code: "zdr_incompatible" },
  );
}
