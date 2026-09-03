/**
 * Tip-to-tip smoke: eco local siempre; hop live solo si hay keys de lab.
 * Usage: NEXUS_URL=… NEXUS_API_KEY=… node --import tsx scripts/tip-to-tip.ts
 */
const base = (process.env.NEXUS_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const key = process.env.NEXUS_API_KEY;

async function main() {
  const statusRes = await fetch(`${base}/api/v1/status`);
  const status = await statusRes.json();
  const wired = Object.entries(status.data?.providers ?? status.providers ?? {}).filter(
    ([, v]) => v === true || (v as { wired?: boolean })?.wired === true,
  );
  console.log("status ok", statusRes.status, "wired labs", wired.length || "(eco)");

  const previewRes = await fetch(`${base}/api/v1/routing/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "nexus/auto",
      messages: [{ role: "user", content: "tip-to-tip" }],
    }),
  });
  const preview = await previewRes.json();
  console.log("preview", preview.data?.mode, "hops", preview.data?.hops?.length ?? 0);

  if (!key) {
    console.log("skip completion: set NEXUS_API_KEY for authenticated tip-to-tip");
    process.exit(0);
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
  const provider = chat.provider ?? chat.choices?.[0]?.message?.content;
  console.log("completion", chatRes.status, "provider", chat.provider ?? "?", "id", chat.id);
  if (!chatRes.ok) process.exit(1);
  if (wired.length && chat.provider === "local") {
    console.warn("warn: labs wired but provider=local — check BYOK/routing");
  }
  void provider;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
