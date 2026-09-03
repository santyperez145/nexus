import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { formatUsd, microsToUsd } from "@/lib/money";

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

  return (
    <div className="max-w-3xl">
      <Link href="/activity" className="text-sm text-zinc-500 hover:text-white">
        ← Activity
      </Link>
      <h1 className="mt-4 font-mono text-xl font-semibold">{row.id}</h1>
      <dl className="mt-6 grid gap-3 text-sm md:grid-cols-2">
        <div>
          <dt className="text-zinc-500">Modelo pedido</dt>
          <dd>{row.requestedModel}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Ruteado</dt>
          <dd>{row.routedModel}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Provider</dt>
          <dd>{row.provider}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Finish</dt>
          <dd>{row.finishReason ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Tokens</dt>
          <dd>
            {row.promptTokens} + {row.completionTokens}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Costo</dt>
          <dd>{formatUsd(microsToUsd(row.costMicros))}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Latencia</dt>
          <dd>{row.latencyMs ?? "—"} ms</dd>
        </div>
        <div>
          <dt className="text-zinc-500">BYOK</dt>
          <dd>{row.isByok ? "sí" : "no"}</dd>
        </div>
      </dl>
      {row.prompt ? (
        <pre className="mt-8 overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-4 text-xs text-zinc-300">
          {row.prompt}
        </pre>
      ) : null}
      {row.completion ? (
        <pre className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-4 text-xs text-zinc-200">
          {row.completion}
        </pre>
      ) : (
        <p className="mt-6 text-sm text-zinc-500">
          Prompt/completion no se guardan salvo que actives logging en Privacy.
        </p>
      )}
    </div>
  );
}
