import { MarketingShell } from "@/components/layout/marketing-shell";

export default function TermsPage() {
  return (
    <MarketingShell>
      <article className="mx-auto max-w-2xl px-4 py-12 text-sm leading-6 text-zinc-600">
        <h1 className="mb-4 text-3xl font-semibold tracking-tight text-zinc-950">Términos</h1>
        <p>
          Nexus vende acceso unificado a APIs de terceros. El precio de inferencia es el de lista
          del laboratorio; al cargar créditos se aplica un fee de plataforma. No revendemos marcas
          ajenas ni nos hacemos pasar por otro gateway.
        </p>
        <p className="mt-4">
          Sos responsable de cumplir los términos de cada lab (OpenAI, Anthropic, Google, etc.) y de
          no usar el servicio para abuso. Las keys de Nexus empiezan con{" "}
          <code className="text-zinc-800">sk-nx-</code>.
        </p>
      </article>
    </MarketingShell>
  );
}
