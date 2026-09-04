import { and, eq, isNull, or } from "drizzle-orm";
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

type GuardrailPolicy = {
  userId: string;
  workspaceId: string | null;
  allowedProviders: string[] | null;
  enforceZdr: boolean;
};

export function isGuardrailApplicable(auth: AuthContext, guardrail: Pick<GuardrailPolicy, "userId" | "workspaceId">) {
  if (!guardrail.workspaceId) return guardrail.userId === auth.userId;
  return Boolean(
    auth.workspaceId === guardrail.workspaceId &&
      (auth.workspaceIds ?? [auth.workspaceId]).includes(guardrail.workspaceId),
  );
}

export function applyGuardrailRoutingPolicy(req: ChatRequest, guardrails: GuardrailPolicy[]) {
  const providerRules = guardrails
    .map((guardrail) => guardrail.allowedProviders)
    .filter((providers): providers is string[] => Boolean(providers?.length));
  if (providerRules.length) {
    const intersection = providerRules[0].filter((provider) =>
      providerRules.every((rule) => rule.includes(provider)),
    );
    const requested = req.provider?.only;
    const allowed = requested?.length
      ? intersection.filter((provider) => requested.includes(provider))
      : intersection;
    if (!allowed.length) {
      throw Object.assign(new Error("Guardrails leave no allowed provider for this request"), {
        status: 403,
        code: "guardrail_blocked",
      });
    }
    req.provider = { ...req.provider, only: allowed };
  }
  if (guardrails.some((guardrail) => guardrail.enforceZdr)) {
    req.provider = { ...req.provider, zdr: true, data_collection: "deny" };
  }
}

export async function enforceGuardrails(
  auth: AuthContext,
  req: ChatRequest,
  estimatedMicros?: number,
) {
  const rows = await db
    .select()
    .from(schema.guardrails)
    .where(
      auth.workspaceId
        ? or(
            and(eq(schema.guardrails.userId, auth.userId), isNull(schema.guardrails.workspaceId)),
            eq(schema.guardrails.workspaceId, auth.workspaceId),
          )
        : and(eq(schema.guardrails.userId, auth.userId), isNull(schema.guardrails.workspaceId)),
    );
  const scoped = rows.filter((guardrail) => isGuardrailApplicable(auth, guardrail));
  applyGuardrailRoutingPolicy(req, scoped);
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
