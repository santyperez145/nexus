import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";

export default function TermsPage() {
  return (
    <MarketingShell>
      <article className="mx-auto max-w-2xl px-4 py-12 md:py-16">
        <MarketingPageHeader title="Términos">
          Condiciones de uso del gateway Nexus. No sustituyen los términos de cada laboratorio.
        </MarketingPageHeader>

        <div className="space-y-8 text-sm leading-6 text-zinc-600">
          <section>
            <h2 className="mb-2 text-base font-medium text-zinc-900">Servicio</h2>
            <p>
              Nexus ofrece API unificada, SDK, dashboard y billing sobre modelos de terceros. El
              precio de inferencia es el de lista del catálogo (0% markup). Al cargar créditos se
              aplica un fee de plataforma (5.5%, con un mínimo de USD 0.80). Toda acreditación real queda documentada en el ledger.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-zinc-900">Cuentas y keys</h2>
            <p>
              Sos responsable de tus keys (<code className="text-zinc-800">sk-nx-</code> /{" "}
              <code className="text-zinc-800">sk-nx-mgmt-</code>), workspaces y BYOK. No compartas
              secrets. El abuso (scraping masivo, bypass de rate limits, reventa engañosa de la
              marca Nexus) puede suspender la cuenta.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-zinc-900">Labs de terceros</h2>
            <p>
              Cada hop cumple (o debe cumplir) los términos del laboratorio (OpenAI, Anthropic,
              Google, Groq, Together, etc.). Nexus no revendemos sus marcas ni nos presentamos como
              ellos. Si un lab rechaza o retira un modelo, el catálogo y el ruteo lo reflejan.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-zinc-900">Créditos y reembolsos</h2>
            <p>
              Los créditos son prepago para uso en la plataforma. Las cargas vía Stripe están
              sujetas a su flujo de pago. Reembolsos por error de plataforma se evalúan caso a caso;
              el uso consumido (tokens / media) no se reembolsa automáticamente.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-zinc-900">Disponibilidad</h2>
            <p>
              El status público en <code className="text-zinc-800">/status</code> refleja checks
              honestos. Sin keys de lab cableadas, producción devuelve provider_unwired y no simula
              una respuesta frontier. No garantizamos SLA de terceros.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-zinc-900">Limitación</h2>
            <p>
              En la máxima medida permitida por la ley aplicable, Nexus no responde por daños
              indirectos derivados del uso de modelos de terceros, downtime de labs o contenido
              generado. El servicio se ofrece “as is” salvo obligaciones legales ineludibles.
            </p>
          </section>
        </div>
      </article>
    </MarketingShell>
  );
}
