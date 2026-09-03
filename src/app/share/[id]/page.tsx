import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { db, ensureDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ensureDb();
  const [row] = await db
    .select()
    .from(schema.chatShares)
    .where(eq(schema.chatShares.id, id))
    .limit(1);
  if (!row) notFound();

  const payload = row.payload;
  const title = row.title || "Shared chat";
  const stats = payload.stats && typeof payload.stats === "object" ? payload.stats : null;
  const statEntries = stats
    ? Object.entries(stats).filter(([, v]) => v !== null && v !== undefined && v !== "")
    : [];

  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl px-4 py-12 md:py-16">
        <p className="mb-2 text-sm text-zinc-500">
          <Link href="/chat" className="text-violet-700 hover:underline">
            Chat
          </Link>
          <span className="mx-2 text-zinc-300">/</span>
          share · read-only
          {payload.comparing ? (
            <>
              <span className="mx-2 text-zinc-300">·</span>
              <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-900">
                compare
              </span>
            </>
          ) : null}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          {title}
        </h1>
        <p className="mt-2 font-mono text-xs text-zinc-500">
          {payload.model}
          {row.createdAt ? ` · ${row.createdAt.toISOString().slice(0, 19)}Z` : ""}
        </p>

        {statEntries.length ? (
          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {statEntries.slice(0, 6).map(([k, v]) => (
              <div key={k} className="rounded-xl border border-zinc-200 bg-white/60 px-3 py-2">
                <dt className="text-[10px] uppercase tracking-[0.08em] text-zinc-400">{k}</dt>
                <dd className="mt-0.5 truncate font-mono text-sm text-zinc-800">{String(v)}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="mt-8 space-y-4 border-t border-zinc-200 pt-6">
          {payload.messages.map((m, i) => (
            <div
              key={i}
              className={`rounded-xl px-3 py-2 ${
                m.role === "assistant" ? "bg-zinc-50" : m.role === "system" ? "bg-violet-50/50" : ""
              }`}
            >
              <div className="mb-1 text-[11px] uppercase tracking-[0.08em] text-zinc-400">{m.role}</div>
              <div
                className={`whitespace-pre-wrap text-sm leading-relaxed ${
                  m.role === "user" ? "text-zinc-800" : "text-zinc-600"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap gap-3 text-sm">
          <Link
            href={`/chat?model=${encodeURIComponent(payload.model)}`}
            className="rounded-md bg-zinc-900 px-3 py-2 text-white hover:bg-zinc-800"
          >
            Abrir en playground
          </Link>
          <Link
            href={`/models/${encodeURIComponent(payload.model)}`}
            className="rounded-md border border-zinc-200 px-3 py-2 text-zinc-700 hover:bg-zinc-50"
          >
            Ver modelo
          </Link>
          <Link href="/docs" className="rounded-md border border-zinc-200 px-3 py-2 text-zinc-700 hover:bg-zinc-50">
            Docs API
          </Link>
        </div>
      </div>
    </MarketingShell>
  );
}
