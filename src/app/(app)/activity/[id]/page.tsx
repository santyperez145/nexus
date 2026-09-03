import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { APP_URL } from "@/lib/config";
import { formatUsd, microsToUsd } from "@/lib/money";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";

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
  const hops = Array.isArray(meta.route_hops)
    ? (meta.route_hops as Array<{ model?: string; adapter?: string; zdr?: boolean }>)
    : [];
  const when = new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(row.createdAt));

  const totalTok = Math.max(1, row.promptTokens + row.completionTokens + row.reasoningTokens + cached);
  const tokenParts = [
    { label: "prompt", n: row.promptTokens, color: "bg-violet-500" },
    { label: "completion", n: row.completionTokens, color: "bg-emerald-400/60" },
    { label: "reasoning", n: row.reasoningTokens, color: "bg-sky-400/50" },
    { label: "cached", n: cached, color: "bg-zinc-400/40" },
  ].filter((p) => p.n > 0);

  const curl = `curl ${APP_URL}/api/v1/chat/completions \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${row.routedModel}","messages":[{"role":"user","content":"replay"}]}'`;

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
    prompt: row.prompt ?? undefined,
    completion: row.completion ?? undefined,
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
            <CopyButton value={row.id} label="Copiar id" />
            <CopyButton value={curl} label="Copiar curl" />
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
        {row.isByok ? " · BYOK" : ""}
        {row.error ? " · error" : ""}
      </AppPageHeader>

      <div className="mb-6 flex flex-wrap gap-2">
        {[
          row.streamed ? "streamed" : "sync",
          row.isByok ? "byok" : "pool",
          local ? "local echo" : "lab",
          row.error ? "failed" : "ok",
        ].map((b) => (
          <span
            key={b}
            className="rounded-full border border-zinc-200 px-2.5 py-0.5 text-[11px] uppercase tracking-wide text-zinc-400"
          >
            {b}
          </span>
        ))}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {[
          { label: "Costo", value: formatUsd(microsToUsd(row.costMicros)) },
          { label: "Tokens", value: String(row.promptTokens + row.completionTokens) },
          { label: "Latencia", value: row.latencyMs != null ? `${row.latencyMs} ms` : "—" },
          { label: "Finish", value: row.finishReason ?? "—" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-zinc-200 bg-white px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">{s.label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-zinc-900">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <section className="mb-8 rounded-2xl border border-zinc-200 px-4 py-4">
        <div className="mb-2 text-xs uppercase tracking-[0.1em] text-zinc-500">Token split</div>
        <div className="mb-2 flex h-2 overflow-hidden rounded-full bg-white/5">
          {tokenParts.map((p) => (
            <div
              key={p.label}
              className={p.color}
              style={{ width: `${Math.max(2, (p.n / totalTok) * 100)}%` }}
              title={`${p.label}: ${p.n}`}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
          {tokenParts.map((p) => (
            <span key={p.label}>
              {p.label} <span className="tabular-nums text-zinc-600">{p.n.toLocaleString()}</span>
            </span>
          ))}
        </div>
      </section>

      {hops.length ? (
        <section className="mb-8">
          <h2 className="mb-2 text-xs uppercase tracking-[0.1em] text-zinc-500">Route hops</h2>
          <ol className="flex flex-wrap gap-1.5">
            {hops.map((h, i) => (
              <li
                key={`${h.adapter}-${h.model}-${i}`}
                className={`rounded border px-1.5 py-0.5 font-mono text-[11px] ${
                  h.adapter === row.provider
                    ? "border-violet-300 text-zinc-700"
                    : "border-zinc-200 text-zinc-500"
                }`}
                title={h.zdr ? "ZDR" : "standard"}
              >
                {h.adapter}
                {h.zdr ? " ·zdr" : ""}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <dl className="mb-8 grid gap-0 overflow-hidden rounded-2xl border border-zinc-200 text-sm md:grid-cols-2">
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
            className={`flex justify-between gap-3 px-4 py-2.5 ${i >= 2 ? "border-t border-zinc-100" : ""} ${
              i % 2 === 1 ? "md:border-l md:border-zinc-100" : ""
            }`}
          >
            <dt className="text-zinc-500">{k}</dt>
            <dd className="max-w-[65%] truncate text-right font-mono text-xs text-zinc-950/80" title={v}>
              {v}
            </dd>
          </div>
        ))}
      </dl>

      {row.prompt ? (
        <section className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs uppercase tracking-[0.1em] text-zinc-500">Prompt</h2>
            <CopyButton value={row.prompt} />
          </div>
          <pre className="overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600">
            {row.prompt}
          </pre>
        </section>
      ) : null}
      {row.completion ? (
        <section className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs uppercase tracking-[0.1em] text-zinc-500">Completion</h2>
            <CopyButton value={row.completion} />
          </div>
          <pre className="overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-800">
            {row.completion}
          </pre>
        </section>
      ) : (
        <p className="mb-6 text-sm text-zinc-500">
          Prompt/completion no se guardan salvo que actives logging en Privacy.
        </p>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-[0.1em] text-zinc-500">JSON (API shape)</h2>
          <CopyButton value={JSON.stringify(payload, null, 2)} />
        </div>
        <pre className="overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-[11px] text-zinc-400">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </section>
    </div>
  );
}
