import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
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

export async function enforceGuardrails(auth: AuthContext, req: ChatRequest) {
  const rows = await db
    .select()
    .from(schema.guardrails)
    .where(eq(schema.guardrails.userId, auth.userId));
  const model = req.model ?? "";
  const prompt = JSON.stringify(req.messages ?? req.prompt ?? "");

  for (const g of rows) {
    if (g.allowedModels?.length && !g.allowedModels.some((m) => model.startsWith(m))) {
      throw Object.assign(new Error(`Guardrail "${g.name}" blocked model ${model}`), { status: 403 });
    }
    if (g.blockedModels?.some((m) => model.includes(m))) {
      throw Object.assign(new Error(`Guardrail "${g.name}" blocked model ${model}`), { status: 403 });
    }
    if (g.promptInjection && INJECTION.some((r) => r.test(prompt))) {
      throw Object.assign(new Error(`Guardrail "${g.name}" detected prompt injection`), { status: 400 });
    }
    if (g.sensitiveInfo && SECRET.some((r) => r.test(prompt))) {
      throw Object.assign(new Error(`Guardrail "${g.name}" detected sensitive credentials`), { status: 400 });
    }
  }
}
