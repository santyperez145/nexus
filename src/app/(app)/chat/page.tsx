import { Playground } from "@/components/chat/playground";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { allModels } from "@/lib/catalog";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { wiredProviders } from "@/lib/providers/registry";
import { and, eq } from "drizzle-orm";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ model?: string; compare?: string }>;
}) {
  const session = await getSession();
  const q = await searchParams;
  const userId = session?.user?.id;
  const [user] = userId
    ? await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1)
    : [];
  const byok = userId
    ? await db
        .select({ id: schema.byokCredentials.id })
        .from(schema.byokCredentials)
        .where(and(eq(schema.byokCredentials.userId, userId), eq(schema.byokCredentials.deleted, false)))
        .limit(1)
    : [];
  const models = allModels().map((m) => ({ id: m.id, name: m.name }));
  return (
    <div>
      <AppPageHeader title="Chat">
        Playground con route trace. Mandá el mismo prompt a uno o dos modelos; el historial queda en este
        dispositivo.
      </AppPageHeader>
      <Playground
        models={models}
        defaultModel={q.model ?? user?.defaultModel ?? "nexus/auto"}
        compareModel={q.compare}
        platformLabs={wiredProviders().length}
        hasByok={byok.length > 0}
      />
    </div>
  );
}
