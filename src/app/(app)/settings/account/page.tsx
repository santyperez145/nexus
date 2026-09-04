import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AccountSettings } from "@/components/settings/account-settings";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { getSession } from "@/lib/auth";
import { db, ensureDb, schema } from "@/lib/db";

function configured(value?: string) {
  return Boolean(value?.trim());
}

export default async function AccountPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  await ensureDb();
  const [[user], [credential]] = await Promise.all([
    db.select().from(schema.users).where(eq(schema.users.id, session.user.id)).limit(1),
    db
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .where(
        and(
          eq(schema.accounts.userId, session.user.id),
          eq(schema.accounts.providerId, "credential"),
        ),
      )
      .limit(1),
  ]);
  if (!user) redirect("/login");

  return (
    <div>
      <AppPageHeader title="Cuenta y seguridad">
        Administrá tu identidad, contraseña y dispositivos con sesiones activas.
      </AppPageHeader>
      <AccountSettings
        initialName={user.name}
        email={user.email}
        emailVerified={user.emailVerified}
        emailDeliveryConfigured={
          configured(process.env.RESEND_API_KEY) && configured(process.env.EMAIL_FROM)
        }
        hasPassword={Boolean(credential)}
        currentSessionId={session.session.id}
        createdAt={user.createdAt.toISOString()}
      />
    </div>
  );
}
