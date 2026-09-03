export type Recipe = {
  slug: string;
  title: string;
  blurb: string;
  tags: string[];
  model: string;
  curl: string;
  sdk: string;
};

/** Starters curados (no marketplace inventado). Atribución real sigue en /apps. */
export const RECIPES: Recipe[] = [
  {
    slug: "auto-router",
    title: "Enrutamiento automático",
    blurb: "Nexus elige la mejor opción disponible y cambia de proveedor si hace falta.",
    tags: ["routing", "latency"],
    model: "nexus/auto",
    curl: `curl $NEXUS_URL/api/v1/chat/completions \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -H "HTTP-Referer: https://tu-app.example" \\
  -H "X-Title: Auto Router Demo" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "nexus/auto",
    "provider": { "sort": "latency", "allow_fallbacks": true },
    "messages": [{"role":"user","content":"ping"}]
  }'`,
    sdk: `import { Nexus } from "nexus-sdk";
const nexus = new Nexus({ apiKey: process.env.NEXUS_API_KEY! });
const r = await nexus.chat.send({
  model: "nexus/auto",
  provider: { sort: "latency", allow_fallbacks: true },
  messages: [{ role: "user", content: "ping" }],
});`,
  },
  {
    slug: "zdr-only",
    title: "Privacidad reforzada",
    blurb: "Procesá contenido únicamente con opciones que declaran no retener tus datos.",
    tags: ["privacy", "zdr"],
    model: "nexus/auto",
    curl: `curl $NEXUS_URL/api/v1/chat/completions \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "nexus/auto",
    "provider": { "data_collection": "deny", "zdr": true },
    "messages": [{"role":"user","content":"Resumí sin entrenamiento"}]
  }'`,
    sdk: `const r = await nexus.chat.send({
  model: "nexus/auto",
  provider: { data_collection: "deny", zdr: true },
  messages: [{ role: "user", content: "Resumí sin entrenamiento" }],
});`,
  },
  {
    slug: "json-schema",
    title: "Datos estructurados",
    blurb: "Obtené respuestas consistentes y listas para automatizaciones o agentes.",
    tags: ["json", "agents"],
    model: "openai/gpt-5-mini",
    curl: `curl $NEXUS_URL/api/v1/chat/completions \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-5-mini",
    "response_format": { "type": "json_object" },
    "messages": [
      {"role":"system","content":"Respondé solo JSON"},
      {"role":"user","content":"keys: status, detail"}
    ]
  }'`,
    sdk: `const r = await nexus.chat.send({
  model: "openai/gpt-5-mini",
  response_format: { type: "json_object" },
  messages: [
    { role: "system", content: "Respondé solo JSON" },
    { role: "user", content: "keys: status, detail" },
  ],
});`,
  },
  {
    slug: "online-search",
    title: "Información actualizada",
    blurb: "Combiná modelos con búsqueda web para responder con información reciente.",
    tags: ["online", "tools"],
    model: "nexus/auto:online",
    curl: `curl $NEXUS_URL/api/v1/chat/completions \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "nexus/auto:online",
    "plugins": [{ "id": "web" }],
    "messages": [{"role":"user","content":"Qué pasó hoy en AI?"}]
  }'`,
    sdk: `const r = await nexus.chat.send({
  model: "nexus/auto:online",
  plugins: [{ id: "web" }],
  messages: [{ role: "user", content: "Qué pasó hoy en AI?" }],
});`,
  },
  {
    slug: "byok-budget",
    title: "Control de gasto del equipo",
    blurb: "Usá tus cuentas de proveedores con un presupuesto compartido y límites claros.",
    tags: ["byok", "billing"],
    model: "anthropic/claude-sonnet-4",
    curl: `curl $NEXUS_URL/api/v1/chat/completions \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -H "X-Nexus-Workspace: ws_…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "anthropic/claude-sonnet-4",
    "provider": { "only": ["anthropic"], "allow_fallbacks": false },
    "messages": [{"role":"user","content":"hola"}]
  }'`,
    sdk: `const r = await nexus.chat.send({
  model: "anthropic/claude-sonnet-4",
  provider: { only: ["anthropic"], allow_fallbacks: false },
  messages: [{ role: "user", content: "hola" }],
});`,
  },
  {
    slug: "route-preview",
    title: "Vista previa de enrutamiento",
    blurb: "Comprobá qué proveedores puede usar una solicitud antes de ejecutarla.",
    tags: ["routing", "debug"],
    model: "nexus/auto",
    curl: `curl $NEXUS_URL/api/v1/routing/preview \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "nexus/auto",
    "provider": { "only": ["groq", "together"] },
    "messages": [{"role":"user","content":"preview"}]
  }'`,
    sdk: `const plan = await nexus.routing.preview({
  model: "nexus/auto",
  provider: { only: ["groq", "together"] },
  messages: [{ role: "user", content: "preview" }],
});`,
  },
  {
    slug: "anthropic-messages",
    title: "Compatible con Anthropic",
    blurb: "Migrá aplicaciones basadas en Messages sin rediseñar toda la integración.",
    tags: ["envelope", "anthropic"],
    model: "anthropic/claude-sonnet-4",
    curl: `curl $NEXUS_URL/api/v1/messages \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "anthropic/claude-sonnet-4",
    "max_tokens": 128,
    "messages": [{"role":"user","content":"hola"}]
  }'`,
    sdk: `const r = await nexus.messages.create({
  model: "anthropic/claude-sonnet-4",
  max_tokens: 128,
  messages: [{ role: "user", content: "hola" }],
});`,
  },
  {
    slug: "openai-responses",
    title: "Compatible con OpenAI Responses",
    blurb: "Usá el formato Responses con el catálogo y las políticas de Nexus.",
    tags: ["envelope", "openai"],
    model: "openai/gpt-4o-mini",
    curl: `curl $NEXUS_URL/api/v1/responses \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-4o-mini",
    "input": "Respondé solo: ok",
    "max_output_tokens": 32
  }'`,
    sdk: `const r = await nexus.responses.create({
  model: "openai/gpt-4o-mini",
  input: "Respondé solo: ok",
  max_output_tokens: 32,
});`,
  },
  {
    slug: "media-image",
    title: "Generación de imagen",
    blurb: "Creá imágenes desde texto con modelos visuales disponibles en el catálogo.",
    tags: ["media", "image"],
    model: "openai/gpt-image-2",
    curl: `curl $NEXUS_URL/api/v1/images/generations \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-image-2",
    "prompt": "amber mesh over dark terminal",
    "n": 1
  }'`,
    sdk: `const img = await nexus.images.generate({
  model: "openai/gpt-image-2",
  prompt: "amber mesh over dark terminal",
  n: 1,
});`,
  },
  {
    slug: "vision-image-url",
    title: "Visión multimodal",
    blurb: "Analizá imágenes, documentos y texto dentro de una misma conversación.",
    tags: ["vision", "multimodal"],
    model: "openai/gpt-4o",
    curl: `curl $NEXUS_URL/api/v1/chat/completions \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-4o",
    "messages": [{
      "role": "user",
      "content": [
        { "type": "text", "text": "Qué hay en la imagen?" },
        { "type": "image_url", "image_url": { "url": "https://…" } }
      ]
    }]
  }'`,
    sdk: `const r = await nexus.chat.send({
  model: "openai/gpt-4o",
  messages: [{
    role: "user",
    content: [
      { type: "text", text: "Qué hay en la imagen?" },
      { type: "image_url", image_url: { url: "https://…" } },
    ],
  }],
});`,
  },
  {
    slug: "guest-playground",
    title: "Demo local (sin API key)",
    blurb: "Solo desarrollo: eco aislado y rate-limited. Producción exige sesión o Bearer.",
    tags: ["guest", "demo"],
    model: "nexus/auto",
    curl: `curl $NEXUS_URL/api/v1/chat/completions \\
  -H "X-Nexus-Guest: 1" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "nexus/auto",
    "stream": false,
    "messages": [{"role":"user","content":"ping guest"}]
  }'`,
    sdk: `// Disponible únicamente en desarrollo local.
// Producción rechaza X-Nexus-Guest y requiere una credencial real.`,
  },
];

export function findRecipe(slug: string) {
  return RECIPES.find((r) => r.slug === slug);
}
