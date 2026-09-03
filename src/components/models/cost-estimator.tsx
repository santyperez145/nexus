"use client";

import { useMemo, useState } from "react";
import { formatUsd } from "@/lib/money";

export function CostEstimator({
  promptPerM,
  completionPerM,
  free,
  tone = "light",
}: {
  promptPerM: number;
  completionPerM: number;
  free?: boolean;
  tone?: "light" | "dark";
}) {
  const [promptTok, setPromptTok] = useState(2_000);
  const [completionTok, setCompletionTok] = useState(500);
  const [preset, setPreset] = useState<"custom" | "1k" | "10k" | "100k">("custom");

  const cost = useMemo(() => {
    if (free) return 0;
    return (promptTok / 1_000_000) * promptPerM + (completionTok / 1_000_000) * completionPerM;
  }, [free, promptTok, completionTok, promptPerM, completionPerM]);

  const per1k =
    free || promptPerM + completionPerM === 0
      ? 0
      : (500 / 1_000_000) * promptPerM + (500 / 1_000_000) * completionPerM;

  const light = tone === "light";
  const box = light
    ? "rounded-xl border border-zinc-200 bg-white"
    : "rounded-2xl border border-white/10 bg-white/[0.02]";
  const muted = light ? "text-zinc-500" : "text-zinc-500";
  const input = light
    ? "h-9 w-full rounded-md border border-zinc-300 bg-white px-2 font-mono text-sm"
    : "h-9 w-full rounded-md border border-white/10 bg-zinc-950 px-2 font-mono text-sm text-zinc-200";

  function applyPreset(p: typeof preset) {
    setPreset(p);
    if (p === "1k") {
      setPromptTok(500);
      setCompletionTok(500);
    } else if (p === "10k") {
      setPromptTok(5_000);
      setCompletionTok(5_000);
    } else if (p === "100k") {
      setPromptTok(50_000);
      setCompletionTok(50_000);
    }
  }

  return (
    <div className={`${box} p-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          className={
            light
              ? "font-[family-name:var(--font-syne)] text-lg font-semibold text-zinc-900"
              : "font-[family-name:var(--font-syne)] text-lg font-semibold text-zinc-100"
          }
        >
          Calculadora de costo
        </h2>
        <span className={`font-mono text-xs ${muted}`}>lista · 0% markup tokens</span>
      </div>
      <p className={`mt-1 text-sm ${muted}`}>
        Ajustá prompt vs completion. Fee de plataforma solo al cargar créditos.
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {(["1k", "10k", "100k", "custom"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => applyPreset(p)}
            className={`rounded-md border px-2.5 py-1 font-mono text-xs ${
              preset === p
                ? light
                  ? "border-amber-600/40 bg-amber-50 text-amber-900"
                  : "border-amber-400/40 bg-amber-400/10 text-amber-200"
                : light
                  ? "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                  : "border-white/10 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {p === "custom" ? "custom" : `${p} tok`}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className={`grid gap-1 text-xs ${muted}`}>
          Prompt tokens
          <input
            type="number"
            min={0}
            step={100}
            value={promptTok}
            onChange={(e) => {
              setPreset("custom");
              setPromptTok(Math.max(0, Number(e.target.value) || 0));
            }}
            className={input}
          />
        </label>
        <label className={`grid gap-1 text-xs ${muted}`}>
          Completion tokens
          <input
            type="number"
            min={0}
            step={100}
            value={completionTok}
            onChange={(e) => {
              setPreset("custom");
              setCompletionTok(Math.max(0, Number(e.target.value) || 0));
            }}
            className={input}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-zinc-200/80 pt-3 dark:border-white/10">
        <div>
          <div className={`text-[10px] uppercase tracking-[0.1em] ${muted}`}>Estimado</div>
          <div
            className={
              light
                ? "font-[family-name:var(--font-syne)] text-2xl font-semibold tabular-nums text-zinc-900"
                : "font-[family-name:var(--font-syne)] text-2xl font-semibold tabular-nums text-amber-200"
            }
          >
            {free ? "Gratis" : formatUsd(cost, 6)}
          </div>
        </div>
        <div className={`text-right font-mono text-xs ${muted}`}>
          <div>
            {(promptTok + completionTok).toLocaleString()} tok total
          </div>
          {!free ? <div>~{formatUsd(per1k, 6)} / 1k (50/50)</div> : null}
        </div>
      </div>
    </div>
  );
}
