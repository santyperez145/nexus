import Link from "next/link";
import { Playground } from "@/components/chat/playground";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { Button } from "@/components/ui/button";
import { allModels } from "@/lib/catalog";
import { getSession } from "@/lib/auth";
import { db, ensureDb, schema } from "@/lib/db";
import { wiredProviders } from "@/lib/providers/registry";
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
  const guest = !userId;

  return (
    <div>
      <AppPageHeader title="Chat">
        Playground con route trace. Mismo prompt a uno o dos modelos · historial en este dispositivo.
      </AppPageHeader>
      {guest ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3">
          <p className="text-sm text-amber-100/90">
            Modo público: podés completar en eco local (sin keys). Cuenta = $1 de crédito + hops live /
            BYOK.
          </p>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/login">Entrar</Link>
            </Button>
            <Button asChild size="sm" className="bg-amber-600 text-white hover:bg-amber-700">
              <Link href="/register">Crear cuenta</Link>
            </Button>
          </div>
        </div>
      ) : null}
      <Playground
        models={models}
        defaultModel={q.model ?? user?.defaultModel ?? "nexus/auto"}
        compareModel={q.compare}
        platformLabs={wiredProviders().length}
        hasByok={byok.length > 0}
        guest={guest}
      />
    </div>
  );
}
