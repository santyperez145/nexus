import { SiteHeader } from "@/components/layout/site-header";

export default function PrivacyPublicPage() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <SiteHeader />
      <article className="mx-auto max-w-2xl px-4 py-12 text-sm leading-6 text-zinc-400">
        <h1 className="mb-4 text-3xl font-semibold text-white">Privacidad</h1>
        <p>
          Nexus es un proxy hacia los laboratorios que vos elijas. Por defecto no guardamos
          prompts ni completions. Si activás logging en Settings, queda en tu cuenta a cambio
          de un 1% de descuento.
        </p>
        <p className="mt-4">
          Los créditos, keys hasheadas y metadatos de uso (tokens, modelo, costo) se almacenan
          para facturar. BYOK se cifra en reposo. ZDR limita el ruteo a providers que declaran
          retención cero.
        </p>
      </article>
    </div>
  );
}
