/**
 * Tip-to-tip smoke: eco local siempre; hop live solo si hay keys de lab.
 * Usage:
 *   npm run tip-to-tip
 *   NEXUS_URL=https://… npm run tip-to-tip          # public smoke (status+preview)
 *   NEXUS_URL=… NEXUS_API_KEY=… npm run tip-to-tip  # + completion
 */
const base = (process.env.NEXUS_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const key = process.env.NEXUS_API_KEY;

type Summary = {
  status: number;
  statusMode: string | null;
  statusOk: boolean | null;
  previewMode: string | null;
  hops: number;
  wiredHops: number;
  completionStatus: number | null;
  provider: string | null;
  generationId: string | null;
  publicOnly: boolean;
  ok: boolean;
};

async function main() {
  const summary: Summary = {
    status: 0,
    statusMode: null,
    statusOk: null,
    previewMode: null,
    hops: 0,
    wiredHops: 0,
    completionStatus: null,
    provider: null,
    generationId: null,
    publicOnly: !key,
    ok: false,
  };

  const statusRes = await fetch(`${base}/api/v1/status`);
  summary.status = statusRes.status;
  const status = await statusRes.json();
  summary.statusMode = status.mode ?? null;
  summary.statusOk = typeof status.ok === "boolean" ? status.ok : null;
  console.log("status", statusRes.status, JSON.stringify(status).slice(0, 280));

  const previewRes = await fetch(`${base}/api/v1/routing/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "nexus/auto",
      messages: [{ role: "user", content: "tip-to-tip" }],
    }),
  });
  const preview = await previewRes.json();
  const hops = preview.data?.hops ?? [];
  summary.previewMode = preview.data?.mode ?? null;
  summary.hops = hops.length;
  summary.wiredHops = hops.filter((h: { wired?: boolean }) => h.wired).length;
  console.log("preview", summary.previewMode, "hops", summary.hops, "wired", summary.wiredHops);

  if (!key) {
    summary.ok = statusRes.ok && previewRes.ok && summary.statusOk !== false;
    console.log("public smoke only (set NEXUS_API_KEY for completion)");
    console.log("SUMMARY", JSON.stringify(summary));
    process.exit(summary.ok ? 0 : 1);
  }

  const chatRes = await fetch(`${base}/api/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://nexus.local/tip-to-tip",
      "X-Title": "TipToTip",
    },
    body: JSON.stringify({
      model: "nexus/auto",
      messages: [{ role: "user", content: "Respondé solo: ok" }],
      max_tokens: 16,
    }),
  });
  const chat = await chatRes.json();
  summary.completionStatus = chatRes.status;
  summary.provider = chat.provider ?? null;
  summary.generationId = chat.id ?? null;
  console.log("completion", chatRes.status, "provider", summary.provider, "id", summary.generationId);

  if (chatRes.ok && summary.generationId) {
    const genRes = await fetch(
      `${base}/api/v1/generation?id=${encodeURIComponent(summary.generationId)}`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    const gen = await genRes.json();
    console.log("generation", genRes.status, gen.data?.provider ?? gen.data?.model ?? "");
  }

  const liveMismatch =
    (summary.wiredHops > 0 || summary.statusMode === "live") && summary.provider === "local";
  if (liveMismatch) {
    console.warn("warn: status/preview suggest live hops but completion provider=local");
    if (process.env.NEXUS_STRICT_LIVE === "1") {
      summary.ok = false;
      console.log("SUMMARY", JSON.stringify(summary));
      process.exit(1);
    }
  }

  summary.ok = statusRes.ok && previewRes.ok && chatRes.ok && summary.statusOk !== false;
  console.log("SUMMARY", JSON.stringify(summary));
  process.exit(summary.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
