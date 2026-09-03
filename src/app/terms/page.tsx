import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <SiteHeader />
      <article className="mx-auto max-w-2xl px-4 py-12 text-sm leading-6 text-zinc-400">
        <h1 className="mb-4 text-3xl font-semibold text-white">Términos</h1>
        <p>
          Nexus vende acceso unificado a APIs de terceros. El precio de inferencia es el de
          lista del laboratorio; al cargar créditos se aplica un fee de plataforma. No
          revendemos marcas ajenas ni nos hacemos pasar por otro gateway.
        </p>
        <p className="mt-4">
          Sos responsable de cumplir los términos de cada lab (OpenAI, Anthropic, Google, etc.)
          y de no usar el servicio para abuso. Las keys de Nexus empiezan con{" "}
          <code>sk-nx-</code>.
        </p>
      </article>
      <SiteFooter />
    </div>
  );
}
