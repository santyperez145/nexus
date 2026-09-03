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
    title: "Auto-router con fallbacks",
    blurb: "Dejá que nexus/auto elija host; ordená por latency y permití fallbacks.",
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
    title: "ZDR-only completion",
    blurb: "Hard-filter a endpoints de retención cero (data_collection deny).",
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
    title: "Salida JSON estructurada",
    blurb: "response_format json_object para agentes y pipelines.",
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
    title: "Web search (:online)",
    blurb: "Variante :online + plugin web para grounding fresco.",
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
    title: "BYOK con techo de workspace",
    blurb: "Tu key de lab + budget de workspace; Nexus cobra fee de carga, 0% markup en tokens.",
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
    title: "Preview de hops sin gastar",
    blurb: "Inspeccioná adapters cableados antes del completion (guest OK).",
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
    title: "Envelope Anthropic Messages",
    blurb: "POST /messages — misma inferencia, reshape Anthropic.",
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
    title: "Envelope OpenAI Responses",
    blurb: "POST /responses con input string o array.",
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
    blurb: "POST /images/generations — placeholder local sin OPENAI key.",
    tags: ["media", "image"],
    model: "openai/gpt-image-1",
    curl: `curl $NEXUS_URL/api/v1/images/generations \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-image-1",
    "prompt": "amber mesh over dark terminal",
    "n": 1
  }'`,
    sdk: `const img = await nexus.images.generate({
  model: "openai/gpt-image-1",
  prompt: "amber mesh over dark terminal",
  n: 1,
});`,
  },
  {
    slug: "vision-image-url",
    title: "Visión multimodal",
    blurb: "messages[].content[] con text + image_url (data: o https).",
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
];

export function findRecipe(slug: string) {
  return RECIPES.find((r) => r.slug === slug);
}
