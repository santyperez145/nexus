import { inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { extractFileText } from "@/lib/files/extract";
import type { AuthContext, ChatMessage, ChatRequest } from "./types";

export async function attachUserFiles(
  auth: AuthContext,
  req: ChatRequest,
  messages: ChatMessage[],
): Promise<ChatMessage[]> {
  const ids = [...(req.file_ids ?? [])];
  if (req.plugins?.some((p) => p.id === "file-parser" || p.id === "files")) {
    const extra = (req.plugins ?? [])
      .flatMap((p) => (Array.isArray(p.file_ids) ? (p.file_ids as string[]) : []))
      .filter(Boolean);
    ids.push(...extra);
  }
  const unique = [...new Set(ids)];
  if (!unique.length) return messages;

  const rows = await db.select().from(schema.files).where(inArray(schema.files.id, unique));
  const owned = rows.filter((r) => r.userId === auth.userId);
  if (!owned.length) return messages;

  const body = owned
    .map((f) => {
      const text = extractFileText(f.mime, f.content ?? "", f.filename);
      return `--- file:${f.filename} (${f.id}) ---\n${text}`;
    })
    .join("\n\n");

  return [{ role: "system", content: `Archivos adjuntos por el usuario:\n\n${body}` }, ...messages];
}
