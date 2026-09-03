import { MarketingShell } from "@/components/layout/marketing-shell";

export default function PrivacyPublicPage() {
  return (
    <MarketingShell>
      <article className="mx-auto max-w-2xl px-4 py-12 text-sm leading-6 text-zinc-600">
        <h1 className="mb-4 text-3xl font-semibold tracking-tight text-zinc-950">Privacidad</h1>
        <p>
          Nexus es un proxy hacia los laboratorios que vos elijas. Por defecto no guardamos prompts
          ni completions. Si activás logging en Settings, queda en tu cuenta a cambio de un 1% de
          descuento.
        </p>
        <p className="mt-4">
          Los créditos, keys hasheadas y metadatos de uso (tokens, modelo, costo) se almacenan para
          facturar. BYOK se cifra en reposo. ZDR limita el ruteo a providers que declaran retención
          cero.
        </p>
      </article>
    </MarketingShell>
  );
}
