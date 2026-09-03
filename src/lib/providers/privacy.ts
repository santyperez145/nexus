import type { ModelEndpoint } from "@/lib/catalog";
import { providerById } from "./registry";

function configuredProviderIds(name: "ZDR_PROVIDER_IDS" | "NO_TRAINING_PROVIDER_IDS") {
  return new Set(
    (process.env[name] ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** A capability flag is not enough: production must confirm the active provider agreement. */
export function isProviderZdrConfirmed(providerId: string) {
  const provider = providerById(providerId);
  return Boolean(provider?.zdr && configuredProviderIds("ZDR_PROVIDER_IDS").has(provider.id));
}

export function isProviderNoTrainingConfirmed(providerId: string) {
  const provider = providerById(providerId);
  return Boolean(provider && configuredProviderIds("NO_TRAINING_PROVIDER_IDS").has(provider.id));
}

export function isEndpointZdrConfirmed(endpoint: ModelEndpoint) {
  return Boolean(endpoint.zdr && isProviderZdrConfirmed(endpoint.adapter));
}

export function isEndpointNoTrainingConfirmed(endpoint: ModelEndpoint) {
  return isProviderNoTrainingConfirmed(endpoint.adapter);
}
