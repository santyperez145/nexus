import Link from "next/link";
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

  const zdr = user?.zdr ?? false;
  const logPrompts = user?.logPrompts ?? false;
  const allowTraining = user?.allowTraining ?? true;

  return (
    <div>
      <AppPageHeader title="Privacy">
        Controles que el router aplica en cada hop: ZDR hard-filter, logging opcional (−1% lista) y
        training-safe providers. Mismos flags que marketing promete — sin inventar compliance de
        terceros.
      </AppPageHeader>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Metric
          label="ZDR"
          value={zdr ? "ON" : "OFF"}
          hint={zdr ? "Solo hosts zero-retention" : "Todos los hosts elegibles"}
          on={zdr}
        />
        <Metric
          label="Prompt log"
          value={logPrompts ? "ON (−1%)" : "OFF"}
          hint={logPrompts ? "1% descuento lista" : "Sin descuento logging"}
          on={logPrompts}
        />
        <Metric
          label="Training OK"
          value={allowTraining ? "permitido" : "bloqueado"}
          hint={allowTraining ? "Puede incluir labs que entrenan" : "Filtra training-capable"}
          on={!allowTraining}
        />
      </div>

      <PrivacyForm zdr={zdr} logPrompts={logPrompts} allowTraining={allowTraining} />

      <section className="mt-8 rounded-2xl border border-white/10 p-4 text-sm text-zinc-400">
        <div className="font-medium text-zinc-200">Cómo se aplica</div>
        <ul className="mt-2 list-inside list-disc space-y-1 text-zinc-500">
          <li>
            ZDR y allowTraining se evalúan en el router antes del hop (preview en{" "}
            <Link href="/chat" className="text-amber-400 hover:underline">
              Chat
            </Link>
            ).
          </li>
          <li>
            Prompt logging afecta billing/list price — no equivale a “enterprise DPA firmado”.
          </li>
          <li>
            Guardrails de contenido viven en{" "}
            <Link href="/settings/guardrails" className="text-amber-400 hover:underline">
              Guardrails
            </Link>
            ; webhooks en{" "}
            <Link href="/settings/observability" className="text-amber-400 hover:underline">
              Observability
            </Link>
            .
          </li>
        </ul>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  on,
}: {
  label: string;
  value: string;
  hint: string;
  on: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">{label}</div>
      <div className={`mt-1 font-mono text-sm ${on ? "text-amber-300" : "text-zinc-300"}`}>{value}</div>
      <div className="mt-1 text-xs text-zinc-600">{hint}</div>
    </div>
  );
}
