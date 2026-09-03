import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";

const ENDPOINTS = [
  ["POST", "/api/v1/chat/completions", "Chat Completions (OpenAI)"],
  ["POST", "/api/v1/completions", "Completions legacy"],
  ["POST", "/api/v1/messages", "Anthropic Messages (envelope)"],
  ["POST", "/api/v1/responses", "OpenAI Responses (envelope)"],
  ["POST", "/api/v1/embeddings", "Embeddings (+ ledger)"],
  ["POST", "/api/v1/images/generations", "Imágenes (+ ledger)"],
  ["POST", "/api/v1/audio/speech", "TTS (+ ledger)"],
  ["POST", "/api/v1/audio/transcriptions", "STT / Whisper (+ ledger)"],
  ["POST/GET", "/api/v1/videos", "Video (Fal / Replicate, poll + ledger)"],
  ["GET", "/api/v1/models", "Catálogo (category, output_modalities)"],
  ["GET", "/api/v1/models/{author}/{slug}", "Detalle de modelo"],
  ["GET", "/api/v1/models/{author}/{slug}/endpoints", "Hosts de un modelo"],
  ["GET", "/api/v1/providers", "Providers"],
  ["GET", "/api/v1/credits", "Créditos"],
  ["GET", "/api/v1/generation?id=", "Stats de una generación"],
  ["GET", "/api/v1/generations", "Listado de generaciones"],
  ["GET/POST/PATCH/DELETE", "/api/v1/keys", "API keys"],
  ["GET", "/api/v1/auth/key", "Key actual"],
  ["GET/POST/DELETE", "/api/v1/byok", "Bring your own key"],
  ["GET/POST/DELETE", "/api/v1/guardrails", "Guardrails (allow/block)"],
  ["GET/POST/PATCH/DELETE", "/api/v1/workspaces", "Workspaces + budgets"],
  ["GET", "/api/v1/analytics?days=", "Analytics (ventana + provider)"],
  ["GET/POST/DELETE", "/api/v1/files", "Files (file_ids en chat)"],
  ["POST", "/api/v1/oauth", "OAuth PKCE → API key"],
  ["GET/POST/DELETE", "/api/v1/presets", "Presets (@slug)"],
  ["GET", "/api/v1/datasets/models", "Rankings"],
  ["GET/POST/DELETE", "/api/v1/organization", "Organizations + invites pendientes"],
  ["GET/POST/DELETE", "/api/v1/observability", "Webhooks de generaciones"],
  ["GET", "/api/v1/providers/health", "Circuit breakers"],
  ["POST", "/api/v1/routing/preview", "Preview de hops de routing"],
  ["GET", "/api/v1/status", "Estado de cables"],
];

export default function DocsPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl px-4 py-12 md:py-16">
        <MarketingPageHeader title="API">
          SDK propio <code className="text-zinc-800">nexus-sdk</code> o el SDK de OpenAI apuntando a{" "}
          <code className="text-zinc-800">/api/v1</code>. Variantes{" "}
          <code className="text-zinc-800">:fast</code> <code className="text-zinc-800">:cheap</code>{" "}
          <code className="text-zinc-800">:quality</code> <code className="text-zinc-800">:free</code>{" "}
          <code className="text-zinc-800">:online</code>. Routers{" "}
          <code className="text-zinc-800">nexus/auto</code> / <code className="text-zinc-800">nexus/free</code>.
        </MarketingPageHeader>
        <pre className="mb-8 overflow-x-auto border border-zinc-200 bg-white p-4 text-sm text-zinc-800">
{`import { Nexus } from "nexus-sdk";

const nexus = new Nexus({
  apiKey: process.env.NEXUS_API_KEY,
  httpReferer: "https://tu-app.example",
  title: "Tu App",
});

const res = await nexus.chat.send({
  model: "openai/gpt-5",
  messages: [{ role: "user", content: "Hola" }],
  provider: { sort: "throughput", allow_fallbacks: true },
});`}
        </pre>
        <pre className="mb-8 overflow-x-auto border border-zinc-200 bg-white p-4 text-sm text-zinc-800">
{`curl $NEXUS_URL/api/v1/chat/completions \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -H "HTTP-Referer: https://tu-app.example" \\
  -H "X-Title: Tu App" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "~openai/latest",
    "models": ["openai/gpt-5-mini"],
    "transforms": ["middle-out"],
    "stream": true,
    "stream_options": { "include_usage": true },
    "provider": {
      "sort": "throughput",
      "only": ["groq", "together", "fireworks"],
      "max_price": { "prompt": 2, "completion": 4 },
      "allow_fallbacks": true
    },
    "plugins": [{ "id": "web" }],
    "messages": [{"role":"user","content":"Qué pasó hoy en AI?"}]
  }'`}
        </pre>
        <h2 className="mb-3 text-lg font-medium text-zinc-900">Atribución</h2>
        <p className="mb-6 text-sm text-zinc-600">
          Mandá <code className="text-zinc-800">HTTP-Referer</code> (origen de tu app) y{" "}
          <code className="text-zinc-800">X-Title</code> (nombre). Quedan en activity y en{" "}
          <code className="text-zinc-800">GET /api/v1/generation?id=</code>. CORS en{" "}
          <code className="text-zinc-800">/api/v1</code> refleja cualquier origin (Bearer); no uses
          cookies ahí.
        </p>
        <h2 className="mb-3 text-lg font-medium text-zinc-900">Usage</h2>
        <p className="mb-6 text-sm text-zinc-600">
          El completion incluye <code className="text-zinc-800">usage.cost</code>,{" "}
          <code className="text-zinc-800">is_byok</code>,{" "}
          <code className="text-zinc-800">prompt_tokens_details.cached_tokens</code> y{" "}
          <code className="text-zinc-800">completion_tokens_details.reasoning_tokens</code>. En
          stream, el último chunk trae usage si pasás{" "}
          <code className="text-zinc-800">stream_options.include_usage: true</code>. El header{" "}
          <code className="text-zinc-800">X-Request-Id</code> es el id de generación (
          <code className="text-zinc-800">gen-…</code>).
        </p>
        <h2 className="mb-3 text-lg font-medium text-zinc-900">Files</h2>
        <p className="mb-6 text-sm text-zinc-600">
          <code className="text-zinc-800">POST /api/v1/files</code> (multipart, máx 4 MB) y después{" "}
          <code className="text-zinc-800">file_ids</code> en el completion. El gateway inyecta el
          texto en el prompt.
        </p>
        <h2 className="mb-3 text-lg font-medium text-zinc-900">Presets</h2>
        <p className="mb-8 text-sm text-zinc-600">
          <code className="text-zinc-800">model: @mi-preset</code> o{" "}
          <code className="text-zinc-800">nexus/preset/mi-preset</code> mezcla el config guardado en
          Settings → Presets.
        </p>
        <h2 className="mb-3 text-lg font-medium text-zinc-900">Cablear</h2>
        <ol className="mb-8 list-decimal space-y-2 pl-5 text-sm text-zinc-600">
          <li>
            Copiá <code className="text-zinc-800">.env.example</code> a{" "}
            <code className="text-zinc-800">.env.local</code>.
          </li>
          <li>Keys de labs (OpenAI, Groq, Together…). Sin key, ese host se salta.</li>
          <li>
            Opcional: <code className="text-zinc-800">TAVILY_API_KEY</code> / Brave / Exa / Serper
            para búsqueda.
          </li>
          <li>Stripe para créditos reales. Redis para rate limit.</li>
          <li>En la app: Conexiones → Probar cables → Sync catálogo.</li>
        </ol>
        <div className="grid gap-2">
          {ENDPOINTS.map(([method, path, label]) => (
            <div
              key={path}
              className="flex flex-wrap gap-3 border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              <span className="w-36 shrink-0 font-mono text-amber-700">{method}</span>
              <span className="flex-1 font-mono text-zinc-800">{path}</span>
              <span className="text-zinc-500">{label}</span>
            </div>
          ))}
        </div>
        <p className="mt-8 text-sm text-zinc-500">
          Spec:{" "}
          <a className="text-amber-700 hover:underline" href="/openapi.yaml">
            /openapi.yaml
          </a>
        </p>
      </div>
    </MarketingShell>
  );
}
