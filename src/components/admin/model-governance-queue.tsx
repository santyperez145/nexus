"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, FlaskConical, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

type Evaluation = {
  id: string;
  repository_path: string;
  repository_title: string;
  revision: number;
  commit_sha: string;
  benchmark: string;
  task: string;
  dataset: string;
  metric: string;
  metric_value: number;
  evaluator: string;
  evidence_url: string;
  evidence_sha256: string;
  created_at: string;
};

type Promotion = {
  id: string;
  repository_path: string;
  repository_title: string;
  revision: number;
  commit_sha: string;
  runtime_model_id: string;
  created_at: string;
};

async function responseMessage(response: Response) {
  const json = (await response.json().catch(() => ({}))) as {
    error?: string | { message?: string };
  };
  if (response.ok) return;
  throw new Error(
    typeof json.error === "string"
      ? json.error
      : json.error?.message ?? `Operación rechazada (${response.status})`,
  );
}

function ReviewActions({ kind, id }: { kind: "model-evaluations" | "model-promotions"; id: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [running, setRunning] = useState<"approved" | "rejected" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function review(decision: "approved" | "rejected") {
    if (note.trim().length < 8) {
      setMessage("Documentá la decisión con al menos 8 caracteres.");
      return;
    }
    setRunning(decision);
    setMessage(null);
    try {
      const response = await fetch(`/api/internal/admin/${kind}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, note }),
      });
      await responseMessage(response);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo revisar");
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="mt-3 grid gap-2">
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={2_000}
        rows={2}
        placeholder="Evidencia revisada, criterio y motivo de la decisión"
        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={running !== null} onClick={() => review("approved")}>
          {running === "approved" ? "Aprobando…" : "Aprobar"}
        </Button>
        <Button size="sm" variant="outline" disabled={running !== null} onClick={() => review("rejected")}>
          {running === "rejected" ? "Rechazando…" : "Rechazar"}
        </Button>
      </div>
      <div aria-live="polite" className="min-h-4 text-[11px] text-rose-700">{message}</div>
    </div>
  );
}

export function ModelGovernanceQueue({
  evaluations,
  promotions,
}: {
  evaluations: Evaluation[];
  promotions: Promotion[];
}) {
  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-[0_16px_48px_rgba(49,46,129,0.06)]">
      <div className="nexus-console-grid border-b border-white/10 bg-[#0b0e1a] px-5 py-4 text-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-cyan-300" /> Gobierno del catálogo</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-400">
              La evidencia se verifica por revisión inmutable. Una promoción sólo enlaza a un endpoint runtime ya curado; nunca ejecuta artefactos comunitarios por confianza implícita.
            </p>
          </div>
          <div className="flex gap-2 font-mono text-[11px]">
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">{evaluations.length} evals</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">{promotions.length} promociones</span>
          </div>
        </div>
      </div>
      <div className="grid divide-y divide-zinc-100 xl:grid-cols-2 xl:divide-x xl:divide-y-0">
        <div>
          <div className="border-b border-zinc-100 px-5 py-3 text-sm font-semibold text-zinc-900">Evaluaciones pendientes</div>
          <div className="divide-y divide-zinc-100">
            {evaluations.map((evaluation) => (
              <article key={evaluation.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/models/${evaluation.repository_path}`} className="truncate text-sm font-semibold text-indigo-700 hover:underline">
                      {evaluation.repository_path}
                    </Link>
                    <div className="mt-1 font-mono text-[10px] text-zinc-400">v{evaluation.revision} · {evaluation.commit_sha}</div>
                  </div>
                  <FlaskConical className="size-4 shrink-0 text-indigo-500" />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-zinc-50 p-2"><div className="text-[10px] uppercase text-zinc-400">Benchmark</div><div className="mt-0.5 font-medium text-zinc-800">{evaluation.benchmark}</div></div>
                  <div className="rounded-lg bg-zinc-50 p-2"><div className="text-[10px] uppercase text-zinc-400">Resultado</div><div className="mt-0.5 font-mono text-zinc-800">{evaluation.metric} · {evaluation.metric_value}</div></div>
                </div>
                <p className="mt-2 text-[11px] text-zinc-500">{evaluation.dataset} · {evaluation.evaluator}</p>
                <a href={evaluation.evidence_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] text-indigo-700 hover:underline">
                  Evidencia externa <ArrowUpRight className="size-3" />
                </a>
                <div className="mt-1 truncate font-mono text-[9px] text-zinc-400">sha256:{evaluation.evidence_sha256}</div>
                <ReviewActions kind="model-evaluations" id={evaluation.id} />
              </article>
            ))}
            {!evaluations.length ? <p className="px-5 py-10 text-center text-sm text-zinc-500">Sin evaluaciones pendientes.</p> : null}
          </div>
        </div>
        <div>
          <div className="border-b border-zinc-100 px-5 py-3 text-sm font-semibold text-zinc-900">Promociones pendientes</div>
          <div className="divide-y divide-zinc-100">
            {promotions.map((promotion) => (
              <article key={promotion.id} className="p-5">
                <Link href={`/models/${promotion.repository_path}`} className="text-sm font-semibold text-indigo-700 hover:underline">
                  {promotion.repository_path}
                </Link>
                <div className="mt-1 font-mono text-[10px] text-zinc-400">v{promotion.revision} · {promotion.commit_sha}</div>
                <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-indigo-500">Runtime solicitado</div>
                  <div className="mt-1 font-mono text-xs font-medium text-indigo-950">{promotion.runtime_model_id}</div>
                </div>
                <p className="mt-3 text-[11px] leading-5 text-zinc-500">
                  Aprobación fail-closed: última revisión, pública y sin gate; model card, licencia, task/librería, checksum SHA-256, pesos safetensors/GGUF, evaluación verificada y precio runtime vigente.
                </p>
                <ReviewActions kind="model-promotions" id={promotion.id} />
              </article>
            ))}
            {!promotions.length ? <p className="px-5 py-10 text-center text-sm text-zinc-500">Sin promociones pendientes.</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
