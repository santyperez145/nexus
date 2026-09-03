import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";

const CODES = [
  ["400", "invalid_request", "Body o parámetros inválidos"],
  ["401", "unauthorized", "API key / sesión ausente o inválida"],
  ["402", "insufficient_credits", "Sin saldo para el hop"],
  ["403", "guardrail_blocked", "Policy allow/block o injection"],
  ["404", "not_found", "Modelo, file o recurso"],
  ["413", "invalid_request", "Payload / file demasiado grande"],
  ["429", "rate_limit", "RPM / RPD free models"],
  ["502", "provider_error", "Lab upstream falló tras retries"],
];

export default function ErrorsDocsPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl px-4 py-12 md:py-16">
        <p className="mb-3 text-sm text-zinc-500">
          <Link href="/docs" className="text-amber-700 hover:underline">
            Docs
          </Link>
          <span className="mx-2 text-zinc-300">/</span>
          Errors
        </p>
        <MarketingPageHeader title="Errors">
          Envelope OpenAI-shaped:{" "}
          <code className="text-zinc-800">{`{ "error": { "message", "type", "code" } }`}</code>.
        </MarketingPageHeader>
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {CODES.map(([status, code, note], i) => (
            <div
              key={code + status}
              className={`grid gap-1 px-4 py-3 sm:grid-cols-[4rem_12rem_1fr] ${
                i ? "border-t border-zinc-100" : ""
              }`}
            >
              <span className="font-mono text-sm text-zinc-900">{status}</span>
              <code className="text-sm text-amber-800">{code}</code>
              <span className="text-sm text-zinc-600">{note}</span>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-zinc-500">
          SDK: <code className="text-zinc-700">NexusError</code> con{" "}
          <code className="text-zinc-700">status</code> y <code className="text-zinc-700">code</code>.
        </p>
        <pre className="mt-6 overflow-x-auto border border-zinc-200 bg-white p-4 text-sm text-zinc-800">
{`try {
  await nexus.chat.send({ model: "nexus/auto", messages: […] });
} catch (e) {
  if (e instanceof NexusError) {
    console.error(e.status, e.code, e.message); // 402 insufficient_credits…
  }
}`}
        </pre>
        <p className="mt-4 text-sm text-zinc-500">
          Activity filtra <code className="text-zinc-700">errors=1</code>. Guardrails → 403{" "}
          <code className="text-zinc-700">guardrail_blocked</code>.
        </p>
      </div>
    </MarketingShell>
  );
}
