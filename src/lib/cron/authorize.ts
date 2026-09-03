export function authorizeCronRequest(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return { ok: false as const, status: 503, error: "Cron is not configured" };
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }
  return { ok: true as const };
}
