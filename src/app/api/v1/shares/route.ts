import { eq } from "drizzle-orm";
import { db, ensureDb, schema } from "@/lib/db";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { id } from "@/lib/ids";

type SharePayload = {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stats?: Record<string, unknown> | null;
  comparing?: boolean;
};

export async function GET(req: Request) {
  try {
    await ensureDb();
    const shareId = new URL(req.url).searchParams.get("id");
    if (!shareId) {
      return jsonError(Object.assign(new Error("id required"), { status: 400 }));
    }
    const [row] = await db
      .select()
      .from(schema.chatShares)
      .where(eq(schema.chatShares.id, shareId))
      .limit(1);
    if (!row) return jsonError(Object.assign(new Error("not found"), { status: 404 }));
    return Response.json({
      data: {
        id: row.id,
        title: row.title,
        payload: row.payload,
        created_at: row.createdAt,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    await ensureDb();
    let userId: string | null = null;
    try {
      const auth = await authenticateRequest(req);
      userId = auth.userId;
    } catch {
      /* guest share permitido: payload público, sin PII de cuenta */
    }
    const body = (await req.json()) as {
      title?: string;
      model?: string;
      messages?: SharePayload["messages"];
      stats?: Record<string, unknown> | null;
      comparing?: boolean;
    };
    const messages = Array.isArray(body.messages) ? body.messages.slice(0, 40) : [];
    if (!messages.length || !body.model) {
      return jsonError(Object.assign(new Error("model and messages required"), { status: 400 }));
    }
    const sanitized = messages.map((m) => ({
      role: String(m.role ?? "user").slice(0, 32),
      content: String(m.content ?? "").slice(0, 20_000),
    }));
    const row = {
      id: id("share"),
      userId,
      title: (body.title ?? sanitized.find((m) => m.role === "user")?.content ?? "Chat")
        .slice(0, 120)
        .trim(),
      payload: {
        model: String(body.model).slice(0, 200),
        messages: sanitized,
        stats: body.stats ?? null,
        comparing: Boolean(body.comparing),
      } satisfies SharePayload,
    };
    await db.insert(schema.chatShares).values(row);
    return Response.json({
      data: { id: row.id, url: `/share/${row.id}`, title: row.title },
    });
  } catch (error) {
    return jsonError(error);
  }
}
