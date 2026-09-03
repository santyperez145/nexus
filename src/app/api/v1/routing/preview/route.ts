import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { hasProviderKey } from "@/lib/gateway/providers";
import { resolveByokKey } from "@/lib/gateway/byok";
import { resolveRoute } from "@/lib/gateway/router";
import type { ChatRequest } from "@/lib/gateway/types";

/** Preview de routing: qué labs se intentarían y si hay key. */
export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const body = (await req.json()) as ChatRequest;
    const plan = resolveRoute(body, auth);
    const adapters = new Set<string>();
    const hops: Array<{
      model: string;
      adapter: string;
      wired: boolean;
      zdr: boolean;
      pricing: { prompt: number; completion: number };
    }> = [];

    for (const candidate of plan.models) {
      for (const endpoint of candidate.endpoints) {
        if (adapters.has(`${candidate.model.id}:${endpoint.adapter}`)) continue;
        adapters.add(`${candidate.model.id}:${endpoint.adapter}`);
        const byok =
          (await resolveByokKey(auth.userId, endpoint.adapter)) ??
          (await resolveByokKey(auth.userId, endpoint.name));
        hops.push({
          model: candidate.model.id,
          adapter: endpoint.adapter,
          wired: hasProviderKey(endpoint, byok),
          zdr: Boolean(endpoint.zdr),
          pricing: endpoint.pricing,
        });
      }
    }

    const live = hops.filter((h) => h.wired);
    return Response.json({
      data: {
        requested: plan.requested,
        mode: live.length ? "live" : hops.length ? "local_echo" : "empty",
        hops,
        live_count: live.length,
        note:
          live.length === 0
            ? "Sin keys de lab: el gateway responderá en eco local. Agregá BYOK o Conexiones."
            : `${live.length} host(s) cableados; el primero viable gana.`,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
