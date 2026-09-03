import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { db, ensureDb, schema } from "@/lib/db";
import { formatUsd, microsToUsd } from "@/lib/money";

type Params = Promise<{ q?: string; plan?: string }>;

export default async function AdminUsersPage({ searchParams }: { searchParams: Params }) {
  await ensureDb();
  const params = await searchParams;
  const q = params.q?.trim().slice(0, 100) ?? "";
  const plan = ["free", "pro", "team"].includes(params.plan ?? "") ? params.plan! : "";
  const filters: SQL[] = [];
  if (q) filters.push(or(ilike(schema.users.email, `%${q}%`), ilike(schema.users.name, `%${q}%`))!);
  if (plan) filters.push(eq(schema.users.plan, plan));
  const where = filters.length ? and(...filters) : undefined;
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        plan: schema.users.plan,
        subscriptionStatus: schema.users.subscriptionStatus,
        creditMicros: schema.users.creditMicros,
        emailVerified: schema.users.emailVerified,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .where(where)
      .orderBy(desc(schema.users.createdAt))
      .limit(50),
    db.select({ count: count() }).from(schema.users).where(where),
  ]);

  return (
    <div>
      <AppPageHeader title="Usuarios">Directorio global autorizado, con búsqueda server-side y estado comercial persistido.</AppPageHeader>
      <form className="mb-5 grid gap-2 rounded-2xl border border-zinc-200 bg-white p-3 sm:grid-cols-[1fr_10rem_auto]">
        <input name="q" defaultValue={q} placeholder="Buscar nombre o email" className="h-9 rounded-lg border border-zinc-200 px-3 text-sm outline-none focus:border-violet-400" />
        <select name="plan" defaultValue={plan} className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-violet-400">
          <option value="">Todos los planes</option><option value="free">Free</option><option value="pro">Pro</option><option value="team">Team</option>
        </select>
        <button className="h-9 rounded-lg bg-zinc-950 px-4 text-sm font-medium text-white">Filtrar</button>
      </form>
      <div className="mb-3 text-xs text-zinc-500">{Number(totals[0]?.count ?? 0).toLocaleString()} resultados · máximo 50 por vista</div>
      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-[10px] uppercase tracking-[0.1em] text-zinc-500"><tr><th className="px-4 py-3">Usuario</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Saldo</th><th className="px-4 py-3">Identidad</th><th className="px-4 py-3">Alta</th></tr></thead>
          <tbody>
            {rows.map((user) => (
              <tr key={user.id} className="border-b border-zinc-100 last:border-0">
                <td className="px-4 py-3"><div className="font-medium text-zinc-950">{user.name}</div><div className="text-xs text-zinc-500">{user.email}</div></td>
                <td className="px-4 py-3"><span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium uppercase">{user.plan}</span><div className="mt-1 text-[11px] text-zinc-500">{user.subscriptionStatus}</div></td>
                <td className="px-4 py-3 font-mono text-xs">{formatUsd(microsToUsd(user.creditMicros))}</td>
                <td className="px-4 py-3 text-xs"><span className={user.emailVerified ? "text-emerald-700" : "text-amber-700"}>{user.emailVerified ? "Email verificado" : "Sin verificar"}</span><div className="mt-1 font-mono text-[10px] text-zinc-400">{user.id}</div></td>
                <td className="px-4 py-3 text-xs text-zinc-500">{new Date(user.createdAt).toLocaleDateString("es-AR")}</td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={5} className="px-4 py-10 text-center text-zinc-500">No hay usuarios para este filtro.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
