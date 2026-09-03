import { jsonSchema, tool, type ToolSet } from "ai";
import { z } from "zod";
import type { ChatRequest } from "./types";
import { buildServerTools } from "./server-tools";

type FunctionTool = {
  type?: string;
  function?: { name?: string; description?: string; parameters?: Record<string, unknown> };
  name?: string;
  description?: string;
  parameters?: Record<string, unknown>;
};

function asFunctionTool(entry: unknown): FunctionTool | null {
  if (!entry || typeof entry !== "object") return null;
  const t = entry as FunctionTool;
  if (t.type === "function" || t.function?.name || (t.name && t.parameters)) return t;
  return null;
}

export function clientFunctionTools(req: ChatRequest): ToolSet {
  const out: ToolSet = {};
  for (const raw of req.tools ?? []) {
    const t = asFunctionTool(raw);
    if (!t) continue;
    const name = t.function?.name ?? t.name;
    if (!name) continue;
    const description = t.function?.description ?? t.description ?? name;
    const parameters = t.function?.parameters ?? t.parameters ?? { type: "object", properties: {} };
    try {
      out[name] = tool({
        description,
        inputSchema: jsonSchema(parameters),
      });
    } catch {
      out[name] = tool({
        description,
        inputSchema: z.object({}).passthrough(),
      });
    }
  }
  return out;
}

export function mapToolChoice(choice: unknown): "auto" | "none" | "required" | { type: "tool"; toolName: string } | undefined {
  if (choice == null) return undefined;
  if (choice === "auto" || choice === "none" || choice === "required") return choice;
  if (typeof choice === "object" && choice && "type" in choice) {
    const c = choice as { type?: string; function?: { name?: string }; name?: string };
    if (c.type === "none") return "none";
    if (c.type === "auto") return "auto";
    if (c.type === "required" || c.type === "any") return "required";
    const name = c.function?.name ?? c.name;
    if (name) return { type: "tool", toolName: name };
  }
  return undefined;
}

export function mergeTools(req: ChatRequest, variants: string[]): ToolSet | undefined {
  const server = buildServerTools(req, variants) ?? {};
  const client = clientFunctionTools(req);
  const merged = { ...client, ...server };
  return Object.keys(merged).length ? merged : undefined;
}
