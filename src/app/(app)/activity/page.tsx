import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { formatUsd, microsToUsd } from "@/lib/money";

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
      <h1 className="mb-2 text-2xl font-semibold">Activity</h1>
      <p className="mb-6 text-sm text-zinc-500">
        {rows.length} requests · {tokens.toLocaleString()} tokens · {formatUsd(microsToUsd(cost))}
      </p>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-zinc-400">
            <tr>
              <th className="p-3">ID</th>
              <th className="p-3">Modelo</th>
              <th className="p-3">Provider</th>
              <th className="p-3">Tokens</th>
              <th className="p-3">Costo</th>
              <th className="p-3">ms</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="p-4 text-zinc-500" colSpan={6}>
                  Todavía no hay generaciones. Probá el playground o pegale a{" "}
                  <code>/api/v1/chat/completions</code>.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-white/5 hover:bg-white/5">
                  <td className="p-3 font-mono text-xs">
                    <Link href={`/activity/${r.id}`} className="text-amber-400 hover:underline">
                      {r.id}
                    </Link>
                  </td>
                  <td className="p-3">{r.routedModel}</td>
                  <td className="p-3">{r.provider}</td>
                  <td className="p-3">{r.promptTokens + r.completionTokens}</td>
                  <td className="p-3">{formatUsd(microsToUsd(r.costMicros))}</td>
                  <td className="p-3">{r.latencyMs ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
