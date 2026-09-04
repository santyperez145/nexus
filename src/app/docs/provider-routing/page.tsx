import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";

export default function ProviderRoutingDocsPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl px-4 py-12 md:py-16">
        <p className="mb-3 text-sm text-zinc-500">
          <Link href="/docs" className="text-violet-700 hover:underline">
            Docs
          </Link>
          <span className="mx-2 text-zinc-300">/</span>
          Provider routing
        </p>
        <MarketingPageHeader title="Provider routing">
          Misma idea que OpenRouter: un slug, varios hosts. Nexus ordena, filtra y hace fallback
          según <code className="text-zinc-800">provider</code> y privacy de la cuenta.
        </MarketingPageHeader>

        <h2 className="mb-2 text-lg font-medium text-zinc-900">Campos</h2>
        <ul className="mb-8 list-disc space-y-2 pl-5 text-sm text-zinc-600">
          <li>
            <code className="text-zinc-800">order</code> / <code className="text-zinc-800">only</code>{" "}
            / <code className="text-zinc-800">ignore</code> — prioridad y exclusiones de adapter.
          </li>
          <li>
            <code className="text-zinc-800">sort</code> — <code>price</code>,{" "}
            <code>throughput</code>, <code>latency</code> (también vía variantes{" "}
            <code>:cheap</code> / <code>:fast</code>).
          </li>
          <li>
            <code className="text-zinc-800">allow_fallbacks</code> — si es{" "}
            <code>false</code>, no se amplía la lista fuera de order/only.
          </li>
          <li>
            <code className="text-zinc-800">zdr</code> /{" "}
            <code className="text-zinc-800">data_collection: &quot;deny&quot;</code> — hard-filter a
            endpoints con acuerdo ZDR confirmado. Si no hay ninguno, falla sin fallback laxo.
          </li>
          <li>
            <code className="text-zinc-800">max_price</code> — techo por millón de tokens.
          </li>
        </ul>

        <h2 className="mb-2 text-lg font-medium text-zinc-900">Guardrails jerárquicos</h2>
        <p className="mb-3 text-sm text-zinc-600">
          Las reglas de cuenta y las del workspace activo se combinan por intersección. Una
          solicitud puede acotar proveedores, pero nunca ampliar los permitidos por la política.
          Si la intersección queda vacía, Nexus responde <code>403 guardrail_blocked</code> sin
          intentar otro host.
        </p>
        <p className="mb-8 text-sm text-zinc-600">
          <code className="text-zinc-800">allowed_providers</code> restringe adapters y{" "}
          <code className="text-zinc-800">enforce_zdr</code> fuerza ZDR más denegación de
          recolección. Una sesión sin workspace no hereda políticas de otros espacios. Configurá
          estas reglas en{" "}
          <Link href="/settings/guardrails" className="text-violet-700 hover:underline">
            Settings / Guardrails
          </Link>
          .
        </p>

        <pre className="mb-8 overflow-x-auto border border-zinc-200 bg-white p-4 text-sm text-zinc-800">
{`curl $NEXUS_URL/api/v1/chat/completions \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "nexus/auto",
    "provider": {
      "only": ["groq", "together"],
      "sort": "latency",
      "allow_fallbacks": true,
      "data_collection": "deny"
    },
    "messages": [{"role":"user","content":"ping"}]
  }'`}
        </pre>

        <h2 className="mb-2 text-lg font-medium text-zinc-900">Preview sin gastar</h2>
        <p className="mb-4 text-sm text-zinc-600">
          <code className="text-zinc-800">POST /api/v1/routing/preview</code> (también en el
          playground) lista hops con <code className="text-zinc-800">wired</code> real de esta
          instancia. Guest = prefs default; una sesión aplica el mismo preset, guardrails, ZDR,
          BYOK y privacy que la inferencia antes de resolver los hops.
        </p>
        <h2 className="mb-2 text-lg font-medium text-zinc-900">Proveedores incorporados por Nexus</h2>
        <p className="mb-8 text-sm leading-6 text-zinc-600">
          El catálogo combina adapters versionados con proveedores incorporados desde el control
          plane. Estos últimos sólo entran al routing después de una sonda HTTPS protegida contra
          SSRF, revisión de privacidad, precio de lista y readiness por modelo. Nexus vuelve a
          comprobarlos cada 15 minutos; un health vencido o un cambio de contrato retira la ruta
          hasta que un operador la apruebe otra vez. La API pública nunca expone credenciales ni la
          URL privada de configuración. Chat y embeddings reutilizan la misma preferencia de
          proveedor; durante la ejecución, cada conexión gestionada conserva DNS público fijado al
          socket, bloquea redirects y limita el stream upstream.
        </p>
        <p className="text-sm text-zinc-500">
          Ver hosts:{" "}
          <Link href="/providers" className="text-violet-700 hover:underline">
            /providers
          </Link>
          . SDK: <code className="text-zinc-700">nexus.routing.preview(…)</code>.
        </p>
      </div>
    </MarketingShell>
  );
}
