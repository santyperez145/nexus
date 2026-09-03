import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

const ENDPOINTS = [
  ["POST", "/api/v1/chat/completions", "Chat Completions (OpenAI)"],
  ["POST", "/api/v1/completions", "Completions legacy"],
  ["POST", "/api/v1/messages", "Anthropic Messages (shim)"],
  ["POST", "/api/v1/responses", "OpenAI Responses (shim)"],
  ["POST", "/api/v1/embeddings", "Embeddings"],
  ["POST", "/api/v1/images/generations", "Imágenes (OpenAI si hay key)"],
  ["POST", "/api/v1/audio/speech", "TTS"],
  ["POST", "/api/v1/audio/transcriptions", "STT / Whisper"],
  ["POST/GET", "/api/v1/videos", "Video (Fal / Replicate)"],
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
  ["GET/POST/DELETE", "/api/v1/guardrails", "Guardrails"],
  ["GET/POST/PATCH/DELETE", "/api/v1/workspaces", "Workspaces + budgets"],
  ["GET", "/api/v1/analytics", "Analytics"],
  ["GET/POST/DELETE", "/api/v1/files", "Files (file_ids en chat)"],
  ["GET/POST", "/api/v1/oauth", "OAuth PKCE → API key"],
  ["GET/POST/DELETE", "/api/v1/presets", "Presets (@slug)"],
  ["GET", "/api/v1/datasets/models", "Rankings"],
  ["GET/POST/DELETE", "/api/v1/organization", "Organizations + miembros"],
  ["GET/POST/DELETE", "/api/v1/observability", "Webhooks de generaciones"],
  ["GET", "/api/v1/providers/health", "Circuit breakers"],
  ["GET", "/api/v1/status", "Estado de cables"],
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="mb-4 text-3xl font-semibold">API</h1>
        <p className="mb-8 text-zinc-400">
          SDK propio <code>nexus-sdk</code> (425 modelos) o el SDK de OpenAI apuntando a{" "}
          <code>/api/v1</code>. Variantes <code>:fast</code> <code>:cheap</code>{" "}
          <code>:quality</code> <code>:free</code> <code>:online</code>. Routers{" "}
          <code>nexus/auto</code> y <code>nexus/free</code>. Alias{" "}
          <code>~openai/latest</code> / <code>anthropic/latest</code>.
        </p>
        <pre className="mb-8 overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-4 text-sm">
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
        <pre className="mb-8 overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-4 text-sm">
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
        <h2 className="mb-3 text-lg font-medium">Atribución</h2>
        <p className="mb-6 text-sm text-zinc-400">
          Mandá <code>HTTP-Referer</code> (origen de tu app) y <code>X-Title</code> (nombre). Quedan
          en activity y en <code>GET /api/v1/generation?id=</code>. CORS en <code>/api/v1</code>{" "}
          refleja cualquier origin (Bearer); no uses cookies ahí.
        </p>
        <h2 className="mb-3 text-lg font-medium">Usage</h2>
        <p className="mb-6 text-sm text-zinc-400">
          El completion incluye <code>usage.cost</code>, <code>is_byok</code>,{" "}
          <code>prompt_tokens_details.cached_tokens</code> y{" "}
          <code>completion_tokens_details.reasoning_tokens</code>. En stream, el último chunk trae
          usage si pasás <code>stream_options.include_usage: true</code>. El header{" "}
          <code>X-Request-Id</code> es el id de generación (<code>gen-…</code>).
        </p>
        <h2 className="mb-3 text-lg font-medium">Files</h2>
        <p className="mb-6 text-sm text-zinc-400">
          <code>POST /api/v1/files</code> (multipart, máx 4 MB) y después{" "}
          <code>file_ids</code> en el completion. El gateway inyecta el texto en el prompt.
        </p>
        <h2 className="mb-3 text-lg font-medium">Presets</h2>
        <p className="mb-8 text-sm text-zinc-400">
          <code>model: @mi-preset</code> o <code>nexus/preset/mi-preset</code> mezcla el config
          guardado en Settings → Presets.
        </p>
        <h2 className="mb-3 text-lg font-medium">Cablear</h2>
        <ol className="mb-8 list-decimal space-y-2 pl-5 text-sm text-zinc-400">
          <li>Copiá <code>.env.example</code> a <code>.env.local</code>.</li>
          <li>Keys de labs (OpenAI, Groq, Together…). Sin key, ese host se salta.</li>
          <li>Opcional: <code>TAVILY_API_KEY</code> / Brave / Exa / Serper para búsqueda.</li>
          <li>Stripe para créditos reales. Redis para rate limit.</li>
          <li>En la app: Conexiones → Probar cables → Sync catálogo.</li>
        </ol>
        <div className="grid gap-2">
          {ENDPOINTS.map(([method, path, label]) => (
            <div key={path} className="flex gap-3 rounded-lg border border-white/10 px-3 py-2 text-sm">
              <span className="w-36 shrink-0 font-mono text-amber-400">{method}</span>
              <span className="flex-1 font-mono text-zinc-200">{path}</span>
              <span className="text-zinc-500">{label}</span>
            </div>
          ))}
        </div>
        <p className="mt-8 text-sm text-zinc-500">
          Spec: <a className="text-amber-400 hover:underline" href="/openapi.yaml">/openapi.yaml</a>
        </p>
      </div>
      <SiteFooter />
    </div>
  );
}
