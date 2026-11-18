import { authorizeCronRequest } from "@/lib/cron/authorize";
import { releaseExpiredCreditHolds } from "@/lib/gateway/billing";

export const maxDuration = 60;

export async function GET(req: Request) {
  const authorization = authorizeCronRequest(req);
  if (!authorization.ok) {
    return Response.json({ error: authorization.error }, { status: authorization.status });
  }
  const result = await releaseExpiredCreditHolds();
  if (result.released) console.info("[cron:credit-holds]", result);
  return Response.json({ ok: true, ...result });
}

export const POST = GET;
