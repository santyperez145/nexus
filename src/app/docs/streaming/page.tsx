import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";

export default function StreamingDocsPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl px-4 py-12 md:py-16">
        <p className="mb-3 text-sm text-zinc-500">
          <Link href="/docs" className="text-violet-700 hover:underline">
            Docs
          </Link>
          <span className="mx-2 text-zinc-300">/</span>
          Streaming
        </p>
        <MarketingPageHeader title="Streaming">
          SSE OpenAI-compatible. El header <code className="text-zinc-800">X-Request-Id</code> es el
          id de generación (<code className="text-zinc-800">gen-…</code>).
        </MarketingPageHeader>
        <pre className="mb-6 overflow-x-auto border border-zinc-200 bg-white p-4 text-sm text-zinc-800">
{`curl $NEXUS_URL/api/v1/chat/completions \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -N \\
  -d '{
    "model": "nexus/auto",
    "stream": true,
    "stream_options": { "include_usage": true },
    "messages": [{"role":"user","content":"contá hasta 5"}]
  }'`}
        </pre>
        <pre className="mb-6 overflow-x-auto border border-zinc-200 bg-white p-4 text-sm text-zinc-800">
{`import { Nexus } from "nexus-sdk";
const nexus = new Nexus({ apiKey: process.env.NEXUS_API_KEY });

const stream = await nexus.chat.send({
  model: "nexus/auto",
  stream: true,
  messages: [{ role: "user", content: "contá hasta 5" }],
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices?.[0]?.delta?.content ?? "");
}`}
        </pre>
        <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-600">
          <li>
            Chunks <code className="text-zinc-800">data: {"{…}"}</code> y cierre{" "}
            <code className="text-zinc-800">data: [DONE]</code>.
          </li>
          <li>
            Con <code className="text-zinc-800">stream_options.include_usage</code> el último chunk
            trae <code className="text-zinc-800">usage.cost</code>.
          </li>
          <li>
            SDK: <code className="text-zinc-800">nexus.chat.send({"{ stream: true }"})</code>{" "}
            devuelve un async iterable de deltas (no existe{" "}
            <code className="text-zinc-800">chat.stream</code>).
          </li>
          <li>
            Envelopes: <code className="text-zinc-800">/messages</code> y{" "}
            <code className="text-zinc-800">/responses</code> también aceptan{" "}
            <code className="text-zinc-800">stream: true</code> y emiten su ciclo SSE nativo,
            incluidos texto, herramientas, uso acumulado y evento terminal — ver{" "}
            <Link href="/docs/envelopes" className="text-violet-700 hover:underline">
              Envelopes
            </Link>
            .
          </li>
        </ul>
      </div>
    </MarketingShell>
  );
}
