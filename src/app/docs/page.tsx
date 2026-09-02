import { SiteHeader } from "@/components/layout/site-header";

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
  ["GET", "/api/v1/models", "Catálogo"],
  ["GET", "/api/v1/models/{author}/{slug}", "Detalle de modelo"],
  ["GET", "/api/v1/models/{author}/{slug}/endpoints", "Hosts de un modelo"],
  ["GET", "/api/v1/providers", "Providers"],
  ["GET", "/api/v1/credits", "Créditos"],
  ["GET", "/api/v1/generation?id=", "Stats de una generación"],
  ["GET/POST/DELETE", "/api/v1/keys", "API keys"],
  ["GET/POST/DELETE", "/api/v1/byok", "Bring your own key"],
  ["GET/POST/DELETE", "/api/v1/guardrails", "Guardrails"],
  ["GET/POST", "/api/v1/workspaces", "Workspaces"],
  ["GET", "/api/v1/analytics", "Analytics"],
  ["GET/POST", "/api/v1/files", "Files"],
  ["GET/POST", "/api/v1/presets", "Presets"],
  ["GET", "/api/v1/datasets/models", "Rankings"],
  ["GET/POST", "/api/v1/organization", "Organizations"],
  ["GET/POST", "/api/v1/observability", "Webhooks de generaciones"],
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
          Compatible con el SDK de OpenAI. Un modelo, varios labs. Variantes{" "}
          <code>:fast</code> <code>:cheap</code> <code>:quality</code> <code>:free</code>{" "}
          <code>:online</code>. Routers <code>nexus/auto</code> y <code>nexus/free</code>.
        </p>
        <pre className="mb-8 overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-4 text-sm">
{`curl $NEXUS_URL/api/v1/chat/completions \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "meta-llama/llama-3.3-70b-instruct:online",
    "models": ["openai/gpt-5-mini"],
    "provider": {
      "sort": "throughput",
      "only": ["groq", "together", "fireworks"],
      "max_price": { "prompt": 2, "completion": 4 },
      "allow_fallbacks": true
    },
    "tools": [{ "type": "nexus:web_search" }],
    "messages": [{"role":"user","content":"Qué pasó hoy en AI?"}]
  }'`}
        </pre>
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
              <span className="w-28 font-mono text-amber-400">{method}</span>
              <span className="flex-1 font-mono text-zinc-200">{path}</span>
              <span className="text-zinc-500">{label}</span>
            </div>
          ))}
        </div>
        <p className="mt-8 text-sm text-zinc-500">
          Spec: <a className="text-amber-400 hover:underline" href="/openapi.yaml">/openapi.yaml</a>
        </p>
      </div>
    </div>
  );
}
