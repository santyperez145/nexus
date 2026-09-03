import { AppPageHeader } from "@/components/layout/app-page-header";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { PrivacyForm } from "./privacy-form";

export default async function PrivacyPage() {
  const session = await getSession();
  const [user] = session
    ? await db.select().from(schema.users).where(eq(schema.users.id, session.user.id)).limit(1)
    : [];
  return (
    <div>
      <AppPageHeader title="Privacy">
        ZDR, logging de prompts (1% de descuento) y si permites providers que entrenan con datos.
      </AppPageHeader>
      <PrivacyForm
        zdr={user?.zdr ?? false}
        logPrompts={user?.logPrompts ?? false}
        allowTraining={user?.allowTraining ?? true}
      />
    </div>
  );
}
