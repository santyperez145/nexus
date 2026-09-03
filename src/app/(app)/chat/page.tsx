import { Playground } from "@/components/chat/playground";
import { allModels } from "@/lib/catalog";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ model?: string; compare?: string }>;
}) {
  const session = await getSession();
  const q = await searchParams;
  const [user] = session?.user
    ? await db.select().from(schema.users).where(eq(schema.users.id, session.user.id)).limit(1)
    : [];
  const models = allModels().map((m) => ({ id: m.id, name: m.name }));
  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Chat</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Playground. Mandá el mismo prompt a uno o dos modelos. Las conversaciones quedan en este
        dispositivo.
      </p>
      <Playground
        models={models}
        defaultModel={q.model ?? user?.defaultModel ?? "nexus/auto"}
        compareModel={q.compare}
      />
    </div>
  );
}
