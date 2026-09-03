/**
 * Tip-to-tip smoke: eco local siempre; hop live solo si hay keys de lab.
 * Usage: NEXUS_URL=… NEXUS_API_KEY=… npm run tip-to-tip
 */
const base = (process.env.NEXUS_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const key = process.env.NEXUS_API_KEY;

type Summary = {
  status: number;
  previewMode: string | null;
  hops: number;
  wiredHops: number;
  completionStatus: number | null;
  provider: string | null;
  generationId: string | null;
  ok: boolean;
};

async function main() {
  const summary: Summary = {
    status: 0,
    previewMode: null,
    hops: 0,
    wiredHops: 0,
    completionStatus: null,
    provider: null,
    generationId: null,
    ok: false,
  };

  const statusRes = await fetch(`${base}/api/v1/status`);
  summary.status = statusRes.status;
  const status = await statusRes.json();
  console.log("status", statusRes.status, JSON.stringify(status.data ?? status).slice(0, 200));

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
    console.log("skip completion: set NEXUS_API_KEY for authenticated tip-to-tip");
    summary.ok = statusRes.ok && previewRes.ok;
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

  if (summary.wiredHops > 0 && summary.provider === "local") {
    console.warn("warn: hops wired but completion provider=local — check BYOK/routing");
  }

  summary.ok = statusRes.ok && previewRes.ok && chatRes.ok;
  console.log("SUMMARY", JSON.stringify(summary));
  process.exit(summary.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
