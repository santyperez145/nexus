import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import {
  FREE_MODEL_CREDITS_THRESHOLD_USD,
  FREE_MODEL_RPD_NO_CREDITS,
  FREE_MODEL_RPD_WITH_CREDITS,
} from "@/lib/config";

export default function LimitsDocsPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl px-4 py-12 md:py-16">
        <p className="mb-3 text-sm text-zinc-500">
          <Link href="/docs" className="text-amber-700 hover:underline">
            Docs
          </Link>
          <span className="mx-2 text-zinc-300">/</span>
          Limits
        </p>
        <MarketingPageHeader title="Limits">
          Rate limits y techos honestos de esta plataforma. Overview muestra RPM/RPD de tu cuenta.
        </MarketingPageHeader>
        <ul className="mb-8 list-disc space-y-2 pl-5 text-sm text-zinc-600">
          <li>
            Modelos <code className="text-zinc-800">:free</code> —{" "}
            {FREE_MODEL_RPD_NO_CREDITS} RPD sin créditos; {FREE_MODEL_RPD_WITH_CREDITS} RPD con ≥ $
            {FREE_MODEL_CREDITS_THRESHOLD_USD} de saldo.
          </li>
          <li>Keys: límite opcional por key (USD / requests) + reset programado.</li>
          <li>Workspaces: budget diario/mensual; BYOK respeta techo del workspace.</li>
          <li>Files: máx 8 MB por archivo (Postgres base64 en esta versión).</li>
          <li>
            Guardrails: techo de costo por request + allow/block de slugs antes del lab.
          </li>
        </ul>
        <pre className="overflow-x-auto border border-zinc-200 bg-white p-4 text-sm text-zinc-800">
{`# Rate limits de la sesión (cookie o bearer)
curl $NEXUS_URL/api/internal/rate-limits \\
  -H "Cookie: …"
# o vía dashboard Overview → card Rate limits`}
        </pre>
      </div>
    </MarketingShell>
  );
}
