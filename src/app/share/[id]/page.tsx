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

  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl px-4 py-12 md:py-16">
        <p className="mb-2 text-sm text-zinc-500">
          <Link href="/chat" className="text-amber-700 hover:underline">
            Chat
          </Link>
          <span className="mx-2 text-zinc-300">/</span>
          share · read-only
        </p>
        <h1 className="font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight text-zinc-900">
          {title}
        </h1>
        <p className="mt-2 font-mono text-xs text-zinc-500">
          {payload.model}
          {row.createdAt ? ` · ${row.createdAt.toISOString().slice(0, 19)}Z` : ""}
        </p>

        <div className="mt-8 space-y-4 border-t border-zinc-200 pt-6">
          {payload.messages.map((m, i) => (
            <div key={i}>
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
          <Link href="/docs" className="rounded-md border border-zinc-200 px-3 py-2 text-zinc-700 hover:bg-zinc-50">
            Docs API
          </Link>
        </div>
      </div>
    </MarketingShell>
  );
}
