import { db, schema } from "@/lib/db";
import { canAccess, userScope } from "./tenant";
import type { AuthContext, ChatRequest } from "./types";

const INJECTION = [
  /ignore (all|previous|above) instructions/i,
  /you are now (dan|jailbroken)/i,
  /reveal (your )?(system prompt|hidden instructions)/i,
];

const SECRET = [
  /sk-[a-zA-Z0-9]{20,}/,
  /sk-nx-[A-Za-z0-9_-]{10,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (RSA |OPENSSH )?PRIVATE KEY-----/,
];

export async function enforceGuardrails(
  auth: AuthContext,
  req: ChatRequest,
  estimatedMicros?: number,
) {
  const rows = await db
    .select()
    .from(schema.guardrails)
    .where(userScope(auth, schema.guardrails.userId, schema.guardrails.workspaceId));
  const scoped = rows.filter((g) => canAccess(auth, g));
  const model = req.model ?? "";
  const prompt = JSON.stringify(req.messages ?? req.prompt ?? "");

  for (const g of scoped) {
    if (g.allowedModels?.length && !g.allowedModels.some((m) => model.startsWith(m))) {
      throw Object.assign(new Error(`Guardrail "${g.name}" blocked model ${model}`), {
        status: 403,
        code: "guardrail_blocked",
      });
    }
    if (g.blockedModels?.some((m) => model.includes(m))) {
      throw Object.assign(new Error(`Guardrail "${g.name}" blocked model ${model}`), {
        status: 403,
        code: "guardrail_blocked",
      });
    }
    if (g.promptInjection && INJECTION.some((r) => r.test(prompt))) {
      throw Object.assign(new Error(`Guardrail "${g.name}" detected prompt injection`), { status: 400 });
    }
    if (g.sensitiveInfo && SECRET.some((r) => r.test(prompt))) {
      throw Object.assign(new Error(`Guardrail "${g.name}" detected sensitive credentials`), { status: 400 });
    }
    if (estimatedMicros != null && g.maxCostMicros != null && estimatedMicros > g.maxCostMicros) {
      throw Object.assign(new Error(`Guardrail "${g.name}" max cost exceeded`), { status: 402 });
    }
  }
}
