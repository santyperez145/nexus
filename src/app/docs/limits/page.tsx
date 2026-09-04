import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import {
  FREE_MODEL_CREDITS_THRESHOLD_USD,
  FREE_MODEL_RPD_NO_CREDITS,
  FREE_MODEL_RPD_WITH_CREDITS,
  PLAN_LIMITS,
} from "@/lib/config";

export default function LimitsDocsPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl px-4 py-12 md:py-16">
        <p className="mb-3 text-sm text-zinc-500">
          <Link href="/docs" className="text-violet-700 hover:underline">
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
          <li>Files: 8 MB vía multipart o hasta 5 GiB vía upload directo S3-compatible con SHA-256.</li>
          <li>
            Guardrails: techo de costo por request + allow/block de slugs antes del lab.
          </li>
          <li>
            Planes: Free {PLAN_LIMITS.free.rpm} RPM / {PLAN_LIMITS.free.apiKeys} keys /{" "}
            {PLAN_LIMITS.free.workspaces} workspace; Pro {PLAN_LIMITS.pro.rpm} RPM /{" "}
            {PLAN_LIMITS.pro.apiKeys} keys / {PLAN_LIMITS.pro.workspaces} workspaces; Team{" "}
            {PLAN_LIMITS.team.rpm.toLocaleString("es-AR")} RPM / {PLAN_LIMITS.team.apiKeys} keys /{" "}
            {PLAN_LIMITS.team.workspaces} workspaces.
          </li>
        </ul>
        <pre className="mb-6 overflow-x-auto border border-zinc-200 bg-white p-4 text-sm text-zinc-800">
{`# Rate limits de la sesión (cookie o bearer)
curl $NEXUS_URL/api/internal/rate-limits \\
  -H "Cookie: …"
# o vía dashboard Overview → card Rate limits`}
        </pre>
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white text-sm">
          {[
            ["RPM cuenta", "Ventana rodante de 60s; Redis distribuido obligatorio en producción"],
            ["RPD :free", `${FREE_MODEL_RPD_NO_CREDITS} / ${FREE_MODEL_RPD_WITH_CREDITS} según saldo`],
            ["Key limit", "USD spend o requests; include_byok_in_limit opcional"],
            ["Workspace", "Budget interval day|month; corta con 402"],
            ["Files", "1/25/250 GiB por plan · SHA-256 · 5 GiB por upload directo"],
            ["Scopes", "inference, management:read y management:write por API key"],
          ].map(([k, v], i) => (
            <div
              key={k}
              className={`grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] ${i ? "border-t border-zinc-100" : ""}`}
            >
              <span className="font-medium text-zinc-800">{k}</span>
              <span className="text-zinc-600">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </MarketingShell>
  );
}
