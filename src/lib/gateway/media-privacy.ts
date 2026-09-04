import {
  isEndpointNoTrainingConfirmed,
  isEndpointZdrConfirmed,
  isProviderNoTrainingConfirmed,
  isProviderZdrConfirmed,
} from "@/lib/providers/privacy";
import type { ModelEndpoint } from "@/lib/catalog";
import type { AuthContext } from "./types";

export function mediaPrivacyAllowed(input: {
  requiresZdr: boolean;
  requiresNoTraining: boolean;
  isByok: boolean;
  zdrConfirmed: boolean;
  noTrainingConfirmed: boolean;
}) {
  if (!input.requiresZdr && !input.requiresNoTraining) return true;
  if (input.isByok) return false;
  if (input.requiresZdr && !input.zdrConfirmed) return false;
  if (input.requiresNoTraining && !input.noTrainingConfirmed && !input.zdrConfirmed) return false;
  return true;
}

/** BYOK keys do not carry a Nexus-verifiable retention/training agreement. */
export function canUseByokForMedia(auth: Pick<AuthContext, "zdr" | "allowTraining">) {
  return !auth.zdr && auth.allowTraining;
}

export function assertMediaPrivacy(auth: AuthContext, provider: string, isByok: boolean) {
  const allowed = mediaPrivacyAllowed({
    requiresZdr: auth.zdr,
    requiresNoTraining: !auth.allowTraining,
    isByok,
    zdrConfirmed: isProviderZdrConfirmed(provider),
    noTrainingConfirmed: isProviderNoTrainingConfirmed(provider),
  });
  if (!allowed) {
    throw Object.assign(
      new Error("No verified provider privacy agreement satisfies this account policy"),
      { status: 503, code: "provider_privacy_unavailable" },
    );
  }
}

export function endpointMediaPrivacyAllowed(
  auth: AuthContext,
  endpoint: ModelEndpoint,
  isByok: boolean,
) {
  return mediaPrivacyAllowed({
    requiresZdr: auth.zdr,
    requiresNoTraining: !auth.allowTraining,
    isByok,
    zdrConfirmed: isEndpointZdrConfirmed(endpoint),
    noTrainingConfirmed: isEndpointNoTrainingConfirmed(endpoint),
  });
}
