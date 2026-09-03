import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";

export default function ParametersDocsPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl px-4 py-12 md:py-16">
        <p className="mb-3 text-sm text-zinc-500">
          <Link href="/docs" className="text-violet-700 hover:underline">
            Docs
          </Link>
          <span className="mx-2 text-zinc-300">/</span>
          Parameters
        </p>
        <MarketingPageHeader title="Parameters">
          Envelope OpenAI-compatible en <code className="text-zinc-800">/api/v1/chat/completions</code>
          . Lo que el lab no soporta se omite o falla según{" "}
          <code className="text-zinc-800">provider.require_parameters</code>.
        </MarketingPageHeader>

        <div className="mb-8 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {[
            ["model / models", "Slug, variante (:fast) o lista de fallbacks"],
            ["messages / prompt", "Chat o completions legacy"],
            ["temperature, top_p, top_k", "Sampling"],
            ["max_tokens / max_completion_tokens", "Tope de salida"],
            ["tools / tool_choice", "Function calling + nexus:web_search"],
            ["response_format", "json_object o json_schema"],
            ["stream + stream_options.include_usage", "SSE + usage final"],
            ["transforms", '["middle-out"] comprime hilos largos'],
            ["file_ids", "Texto → system; imágenes → content[] image_url"],
            ["messages[].content[]", "Multimodal: text + image_url (data: o https)"],
            ["plugins", '[{ "id": "web" }] con :online'],
            ["reasoning / include_reasoning", "Esfuerzo cuando el modelo lo expone"],
            ["provider", "Ver /docs/provider-routing"],
          ].map(([k, v], i) => (
            <div
              key={k}
              className={`grid gap-1 px-4 py-3 sm:grid-cols-[14rem_1fr] ${
                i ? "border-t border-zinc-100" : ""
              }`}
            >
              <code className="text-sm text-violet-800">{k}</code>
              <span className="text-sm text-zinc-600">{v}</span>
            </div>
          ))}
        </div>

        <pre className="mb-6 overflow-x-auto border border-zinc-200 bg-white p-4 text-sm text-zinc-800">
{`{
  "model": "openai/gpt-4o",
  "messages": [{
    "role": "user",
    "content": [
      { "type": "text", "text": "Qué hay en la imagen?" },
      { "type": "image_url", "image_url": { "url": "data:image/png;base64,…" } }
    ]
  }]
}`}
        </pre>
        <p className="mb-8 text-sm text-zinc-600">
          Visión: adjuntá en{" "}
          <Link href="/chat" className="text-violet-700 hover:underline">
            Chat
          </Link>{" "}
          o subí a Files (mime image/*) y pasá <code className="text-zinc-800">file_ids</code>. Sin
          un provider vision-capable, el gateway devuelve provider_unwired.
        </p>

        <pre className="overflow-x-auto border border-zinc-200 bg-white p-4 text-sm text-zinc-800">
{`{
  "model": "openai/gpt-5-mini",
  "temperature": 0.2,
  "response_format": { "type": "json_object" },
  "transforms": ["middle-out"],
  "messages": [
    { "role": "system", "content": "Respondé solo JSON." },
    { "role": "user", "content": "Resumí Nexus en 3 keys." }
  ]
}`}
        </pre>
      </div>
    </MarketingShell>
  );
}
