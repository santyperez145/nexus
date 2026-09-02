export function usdToMicros(usd: number) {
  return Math.round(usd * 1_000_000);
}

export function microsToUsd(micros: number) {
  return micros / 1_000_000;
}

export function formatUsd(usd: number, digits = 4) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  }).format(usd);
}

export function tokenCostUsd(
  promptTokens: number,
  completionTokens: number,
  pricing: { prompt: number; completion: number },
) {
  return promptTokens * pricing.prompt + completionTokens * pricing.completion;
}
