import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";

export default function EnvelopesDocsPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl px-4 py-12 md:py-16">
        <p className="mb-3 text-sm text-zinc-500">
          <Link href="/docs" className="text-amber-700 hover:underline">
            Docs
          </Link>
          <span className="mx-2 text-zinc-300">/</span>
          Envelopes
        </p>
        <MarketingPageHeader title="Envelopes">
          Misma inferencia que chat completions; reshape a Anthropic Messages o OpenAI Responses.
          Billing, routing, ZDR y Activity son idénticos.
        </MarketingPageHeader>

        <section className="mb-10">
          <h2 className="mb-2 font-[family-name:var(--font-syne)] text-xl font-semibold text-zinc-900">
            Anthropic Messages
          </h2>
          <p className="mb-3 text-sm text-zinc-600">
            <code className="text-zinc-800">POST /api/v1/messages</code> — body estilo Anthropic;{" "}
            <code className="text-zinc-800">fallbacks[].model</code> se mapea a{" "}
            <code className="text-zinc-800">models</code> del gateway.
          </p>
          <pre className="overflow-x-auto border border-zinc-200 bg-white p-4 text-sm text-zinc-800">
{`curl $NEXUS_URL/api/v1/messages \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "anthropic/claude-sonnet-4",
    "max_tokens": 256,
    "messages": [{"role":"user","content":"hola"}]
  }'

# SDK
const r = await nexus.messages.create({
  model: "anthropic/claude-sonnet-4",
  max_tokens: 256,
  messages: [{ role: "user", content: "hola" }],
});`}
          </pre>
        </section>

        <section className="mb-10">
          <h2 className="mb-2 font-[family-name:var(--font-syne)] text-xl font-semibold text-zinc-900">
            OpenAI Responses
          </h2>
          <p className="mb-3 text-sm text-zinc-600">
            <code className="text-zinc-800">POST /api/v1/responses</code> —{" "}
            <code className="text-zinc-800">input</code> string o array;{" "}
            <code className="text-zinc-800">max_output_tokens</code> →{" "}
            <code className="text-zinc-800">max_tokens</code>.
          </p>
          <pre className="overflow-x-auto border border-zinc-200 bg-white p-4 text-sm text-zinc-800">
{`curl $NEXUS_URL/api/v1/responses \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-4o-mini",
    "input": "Respondé solo: ok",
    "max_output_tokens": 32
  }'

const r = await nexus.responses.create({
  model: "openai/gpt-4o-mini",
  input: "Respondé solo: ok",
  max_output_tokens: 32,
});`}
          </pre>
        </section>

        <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-600">
          <li>
            Stream: pasá <code className="text-zinc-800">stream: true</code> — mismo SSE que chat.
          </li>
          <li>
            Completions legacy: <code className="text-zinc-800">POST /api/v1/completions</code>{" "}
            (prompt → messages).
          </li>
          <li>
            Probá en{" "}
            <Link href="/chat" className="text-amber-700 hover:underline">
              Chat
            </Link>{" "}
            o recipes{" "}
            <Link href="/apps/anthropic-messages" className="text-amber-700 hover:underline">
              anthropic-messages
            </Link>{" "}
            /{" "}
            <Link href="/apps/openai-responses" className="text-amber-700 hover:underline">
              openai-responses
            </Link>
            .
          </li>
        </ul>
      </div>
    </MarketingShell>
  );
}
