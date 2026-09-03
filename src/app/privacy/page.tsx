import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";

export default function PrivacyPublicPage() {
  return (
    <MarketingShell>
      <article className="mx-auto max-w-2xl px-4 py-12 md:py-16">
        <MarketingPageHeader title="Privacidad">
          Cómo tratamos datos de cuenta, prompts y ruteo. Actualizado para la plataforma Nexus en
          producción.
        </MarketingPageHeader>

        <div className="space-y-8 text-sm leading-6 text-zinc-600">
          <section>
            <h2 className="mb-2 text-base font-medium text-zinc-900">Qué somos</h2>
            <p>
              Nexus es un gateway OpenAI-compatible: ruteamos tus requests a laboratorios que vos
              cableás (keys de plataforma o BYOK). No somos el laboratorio de origen del modelo.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-zinc-900">Prompts y completions</h2>
            <p>
              Por defecto no persistimos el texto de prompts ni completions. Solo metadatos de uso
              (modelo, tokens, costo, latencia, referer) para billing y activity. Si activás{" "}
              <em>log prompts</em> en Settings → Privacy, guardamos contenido en tu cuenta a cambio
              del descuento documentado (1%). Podés desactivarlo en cualquier momento.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-zinc-900">Cuenta y billing</h2>
            <p>
              Guardamos email, hash de password (o identidad OAuth), saldo de créditos, ledger,
              keys hasheadas (<code className="text-zinc-800">sk-nx-…</code>), workspaces y
              preferencias. Stripe procesa cargas de crédito; no almacenamos PAN de tarjetas.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-zinc-900">BYOK y secretos</h2>
            <p>
              Las keys de laboratorio que cargás se cifran en reposo. Solo se desencriptan en el
              momento del hop al provider. No las reexportamos en cleartext por la API.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-zinc-900">ZDR y training</h2>
            <p>
              Zero Data Retention (ZDR) limita el plan de ruteo a endpoints que el catálogo marca
              como ZDR. Preferimos esos hosts; si el filtro vaciaría el plan, el gateway puede
              aflojar para no romper tip-to-tip (eco local / BYOK).{" "}
              <code className="text-zinc-800">allow_training</code> controla si aceptás providers
              que entrenan con datos. Detalle en Docs → Enterprise / ZDR.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-zinc-900">Archivos</h2>
            <p>
              Los uploads de Files viven en tu cuenta (hoy Postgres, cap 4 MB). Se usan para inyectar
              contexto en completions; borrarlos los elimina de almacenamiento.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-zinc-900">Contacto</h2>
            <p>
              Para solicitudes de borrado o acceso a datos de cuenta, usá Settings o el canal de
              soporte publicado en el footer. Respondemos sobre la cuenta autenticada; no inventamos
              tracción ni compartimos datos entre tenants.
            </p>
          </section>
        </div>
      </article>
    </MarketingShell>
  );
}
