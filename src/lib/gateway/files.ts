import { inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { extractFileText } from "@/lib/files/extract";
import type { AuthContext, ChatMessage, ChatRequest } from "./types";
import { canAccess } from "./tenant";

type ContentPart = { type: string; text?: string; image_url?: { url: string } };

function isImageMime(mime: string, filename: string) {
  return /^image\//i.test(mime) || /\.(png|jpe?g|gif|webp|bmp)$/i.test(filename);
}

function asDataUrl(mime: string, contentB64: string) {
  const safe = mime && mime !== "application/octet-stream" ? mime : "image/png";
  return `data:${safe};base64,${contentB64}`;
}

/** Merge image_url parts into the last user message (OpenAI multimodal shape). */
export function injectImageParts(
  messages: ChatMessage[],
  images: Array<{ url: string; name?: string }>,
): ChatMessage[] {
  if (!images.length) return messages;
  const parts: ContentPart[] = images.map((img) => ({
    type: "image_url",
    image_url: { url: img.url },
  }));
  const next = messages.map((m) => ({ ...m }));
  let idx = -1;
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i].role === "user") {
      idx = i;
      break;
    }
  }
  if (idx < 0) {
    next.push({ role: "user", content: parts });
    return next;
  }
  const cur = next[idx];
  if (typeof cur.content === "string") {
    next[idx] = {
      ...cur,
      content: [{ type: "text", text: cur.content }, ...parts],
    };
  } else {
    next[idx] = {
      ...cur,
      content: [...(cur.content ?? []), ...parts],
    };
  }
  return next;
}

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
  const owned = rows.filter((row) => canAccess(auth, row));
  if (owned.length !== unique.length) {
    throw Object.assign(new Error("One or more attached files were not found"), {
      status: 404,
      code: "file_not_found",
    });
  }

  const imageFiles = owned.filter((f) => f.content && isImageMime(f.mime, f.filename));
  const textFiles = owned.filter((f) => !imageFiles.includes(f));

  let next = messages;
  if (textFiles.length) {
    const body = textFiles
      .map((f) => {
        const text = extractFileText(f.mime, f.content ?? "", f.filename);
        return `--- file:${f.filename} (${f.id}) ---\n${text}`;
      })
      .join("\n\n");
    next = [{ role: "system", content: `Archivos adjuntos por el usuario:\n\n${body}` }, ...next];
  }

  if (imageFiles.length) {
    next = injectImageParts(
      next,
      imageFiles.map((f) => ({
        url: asDataUrl(f.mime, f.content!),
        name: f.filename,
      })),
    );
  }

  return next;
}
