import { authorizeCronRequest } from "@/lib/cron/authorize";
import { retryWebhookDeliveries } from "@/lib/observability/dispatch";

export const maxDuration = 60;

export async function GET(req: Request) {
  const authorization = authorizeCronRequest(req);
  if (!authorization.ok) {
    return Response.json({ error: authorization.error }, { status: authorization.status });
  }
  const claimed = await retryWebhookDeliveries();
  return Response.json({ ok: true, claimed });
}

export const POST = GET;
