import Link from "next/link";
import { Playground } from "@/components/chat/playground";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { Button } from "@/components/ui/button";
import { allModels } from "@/lib/catalog";
import { getSession } from "@/lib/auth";
import { db, ensureDb, schema } from "@/lib/db";
import { wiredProviders } from "@/lib/providers/registry";
import { guestPlaygroundEnabled } from "@/lib/config";
import { and, eq } from "drizzle-orm";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ model?: string; compare?: string }>;
}) {
  await ensureDb();
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
  const guest = !userId && guestPlaygroundEnabled();
  const requiresAuth = !userId && !guest;

  return (
    <div>
      <AppPageHeader title="Chat">
        Playground con route trace. Mismo prompt a uno o dos modelos · historial en este dispositivo.
      </AppPageHeader>
      {!userId ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
          <p className="text-sm text-zinc-700">
            {guest
              ? "Demo local de desarrollo: eco aislado, sin providers ni persistencia."
              : "La inferencia de producción requiere una cuenta y una API key o sesión activa."}
          </p>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/login">Entrar</Link>
            </Button>
            <Button asChild size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Link href="/register">Crear cuenta</Link>
            </Button>
          </div>
        </div>
      ) : null}
      {!requiresAuth ? (
        <Playground
          models={models}
          defaultModel={q.model ?? user?.defaultModel ?? "nexus/auto"}
          compareModel={q.compare}
          platformLabs={wiredProviders().length}
          hasByok={byok.length > 0}
          guest={guest}
        />
      ) : null}
    </div>
  );
}
