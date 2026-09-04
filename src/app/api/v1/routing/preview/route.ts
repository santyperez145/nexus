import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { hasProviderKey } from "@/lib/gateway/providers";
import { resolveByokKey } from "@/lib/gateway/byok";
import { resolveRoute } from "@/lib/gateway/router";
import { hasAuthCredentials } from "@/lib/gateway/request-credentials";
import type { ChatRequest } from "@/lib/gateway/types";
import { assertZdrCompatible, canUseByokForRequest } from "@/lib/gateway/handle-chat";
import { enforceGuardrails } from "@/lib/gateway/guardrails";
import { applyPreset } from "@/lib/gateway/presets";
import { isEndpointZdrConfirmed } from "@/lib/providers/privacy";

/** Preview de routing: qué labs se intentarían y si hay key. Público con prefs default. */
export async function POST(req: Request) {
  try {
    const auth = hasAuthCredentials(req)
      ? await authenticateRequest(req)
      : {
          userId: "guest",
          isManagement: false,
          creditMicros: 0,
          zdr: false,
          allowTraining: true,
          logPrompts: false,
        };
    let body = (await req.json()) as ChatRequest;
    if (auth.userId !== "guest") {
      body = await applyPreset(body, auth);
      await enforceGuardrails(auth, body);
      assertZdrCompatible(body, auth);
    }
    const plan = resolveRoute(body, auth);
    const allowByokForRequest = canUseByokForRequest(body, auth);
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
          auth.userId !== "guest" && allowByokForRequest
            ? ((await resolveByokKey(auth.userId, endpoint.adapter, auth)) ??
              (await resolveByokKey(auth.userId, endpoint.name, auth)) ??
              undefined)
            : undefined;
        hops.push({
          model: candidate.model.id,
          adapter: endpoint.adapter,
          wired: hasProviderKey(endpoint, byok),
          zdr: isEndpointZdrConfirmed(endpoint),
          pricing: endpoint.pricing,
        });
      }
    }

    const live = hops.filter((h) => h.wired);
    return Response.json({
      data: {
        requested: plan.requested,
        mode: live.length ? "live" : hops.length ? "unconfigured" : "empty",
        hops,
        live_count: live.length,
        guest: auth.userId === "guest",
        note:
          auth.userId === "guest"
            ? "Preview público (prefs default). Entrá para BYOK y privacy de tu cuenta."
            : live.length === 0
              ? "Sin providers cableados: agregá BYOK o una key de plataforma antes de inferir."
              : `${live.length} host(s) cableados; el primero viable gana.`,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
