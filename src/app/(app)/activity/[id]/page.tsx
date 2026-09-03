import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { formatUsd, microsToUsd } from "@/lib/money";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { Button } from "@/components/ui/button";

export default async function GenerationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const { id } = await params;
  const [row] = await db.select().from(schema.generations).where(eq(schema.generations.id, id)).limit(1);
  if (!row || row.userId !== session.user.id) notFound();

  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const cached = Number(meta.cached_tokens ?? 0);
  const modality = typeof meta.modality === "string" ? meta.modality : null;
  const local = Boolean(meta.local);
  const when = new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(row.createdAt));

  const payload = {
    id: row.id,
    requested_model: row.requestedModel,
    model: row.routedModel,
    provider_name: row.provider,
    streamed: row.streamed,
    is_byok: row.isByok,
    tokens_prompt: row.promptTokens,
    tokens_completion: row.completionTokens,
    native_tokens_reasoning: row.reasoningTokens,
    native_tokens_cached: cached,
    total_cost: microsToUsd(row.costMicros),
    generation_time: row.latencyMs,
    finish_reason: row.finishReason,
    app_referer: row.appReferer,
    origin: row.appTitle,
    created_at: Math.floor(new Date(row.createdAt).getTime() / 1000),
    metadata: meta,
    error: row.error,
  };

  return (
    <div className="max-w-4xl">
      <Link href="/activity" className="text-sm text-zinc-500 hover:text-white">
        ← Activity
      </Link>
      <AppPageHeader
        title={row.id}
        actions={
          <>
            <Button asChild size="sm" variant="outline">
              <Link href={`/chat?model=${encodeURIComponent(row.routedModel)}`}>Abrir en chat</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/studio">Studio</Link>
            </Button>
          </>
        }
      >
        {when}
        {modality ? ` · ${modality}` : ""}
        {local ? " · local" : ""}
        {row.streamed ? " · streamed" : ""}
      </AppPageHeader>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {[
          { label: "Costo", value: formatUsd(microsToUsd(row.costMicros)) },
          { label: "Tokens", value: String(row.promptTokens + row.completionTokens) },
          { label: "Latencia", value: row.latencyMs != null ? `${row.latencyMs} ms` : "—" },
          { label: "Finish", value: row.finishReason ?? "—" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">{s.label}</div>
            <div className="mt-1 font-[family-name:var(--font-syne)] text-xl font-semibold tabular-nums text-zinc-100">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <dl className="mb-8 grid gap-0 overflow-hidden rounded-2xl border border-white/10 text-sm md:grid-cols-2">
        {[
          ["Pedido", row.requestedModel],
          ["Ruteado", row.routedModel],
          ["Provider", row.provider],
          ["BYOK", row.isByok ? "sí" : "no"],
          ["Prompt tokens", String(row.promptTokens)],
          ["Completion tokens", String(row.completionTokens)],
          ["Reasoning tokens", String(row.reasoningTokens)],
          ["Cached tokens", String(cached)],
          ["App title", row.appTitle ?? "—"],
          ["Referer", row.appReferer ?? "—"],
          ["Error", row.error ?? "—"],
        ].map(([k, v], i) => (
          <div
            key={k}
            className={`flex justify-between gap-3 px-4 py-2.5 ${i >= 2 ? "border-t border-white/5" : ""} ${
              i % 2 === 1 ? "md:border-l md:border-white/5" : ""
            }`}
          >
            <dt className="text-zinc-500">{k}</dt>
            <dd className="max-w-[65%] truncate text-right font-mono text-xs text-amber-300/80" title={v}>
              {v}
            </dd>
          </div>
        ))}
      </dl>

      {row.prompt ? (
        <section className="mb-4">
          <h2 className="mb-2 text-xs uppercase tracking-[0.1em] text-zinc-500">Prompt</h2>
          <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-4 text-xs text-zinc-300">
            {row.prompt}
          </pre>
        </section>
      ) : null}
      {row.completion ? (
        <section className="mb-4">
          <h2 className="mb-2 text-xs uppercase tracking-[0.1em] text-zinc-500">Completion</h2>
          <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-4 text-xs text-zinc-200">
            {row.completion}
          </pre>
        </section>
      ) : (
        <p className="mb-6 text-sm text-zinc-500">
          Prompt/completion no se guardan salvo que actives logging en Privacy.
        </p>
      )}

      <section>
        <h2 className="mb-2 text-xs uppercase tracking-[0.1em] text-zinc-500">JSON (API shape)</h2>
        <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-4 text-[11px] text-zinc-400">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </section>
    </div>
  );
}
