import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { formatUsd, microsToUsd } from "@/lib/money";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { Button } from "@/components/ui/button";

function shortId(id: string) {
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function fmtWhen(d: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default async function ActivityPage() {
  const session = await getSession();
  const rows = session
    ? await db
        .select()
        .from(schema.generations)
        .where(eq(schema.generations.userId, session.user.id))
        .orderBy(desc(schema.generations.createdAt))
        .limit(100)
    : [];

  const tokens = rows.reduce((s, r) => s + r.promptTokens + r.completionTokens, 0);
  const cost = rows.reduce((s, r) => s + r.costMicros, 0);

  return (
    <div>
      <AppPageHeader
        title="Activity"
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/chat">Nuevo chat</Link>
          </Button>
        }
      >
        {rows.length} requests · {tokens.toLocaleString()} tokens · {formatUsd(microsToUsd(cost))} en las
        últimas 100.
      </AppPageHeader>

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-white/10 bg-zinc-950/95 text-[11px] uppercase tracking-[0.08em] text-zinc-500 backdrop-blur">
              <tr>
                <th className="px-3 py-2.5 font-medium">Cuando</th>
                <th className="px-3 py-2.5 font-medium">ID</th>
                <th className="px-3 py-2.5 font-medium">Modelo</th>
                <th className="px-3 py-2.5 font-medium">Provider</th>
                <th className="px-3 py-2.5 font-medium text-right">Tokens</th>
                <th className="px-3 py-2.5 font-medium text-right">Costo</th>
                <th className="px-3 py-2.5 font-medium text-right">ms</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-12 text-center text-zinc-500" colSpan={7}>
                    Todavía no hay generaciones. Probá el playground o{" "}
                    <code className="text-zinc-400">POST /api/v1/chat/completions</code>.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr
                    key={r.id}
                    className={`border-t border-white/5 hover:bg-white/[0.03] ${i % 2 === 1 ? "bg-white/[0.015]" : ""}`}
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-zinc-500">
                      {fmtWhen(new Date(r.createdAt))}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs">
                      <Link href={`/activity/${r.id}`} className="text-amber-400/90 hover:underline" title={r.id}>
                        {shortId(r.id)}
                      </Link>
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 font-mono text-[13px] text-amber-300/80">
                      {r.routedModel}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-400">{r.provider}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">
                      {r.promptTokens + r.completionTokens}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">
                      {formatUsd(microsToUsd(r.costMicros))}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-zinc-500">{r.latencyMs ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
