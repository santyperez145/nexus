import type { CatalogModel, ModelEndpoint } from "./types";

function validUnitPrice(value: number) {
  return Number.isFinite(value) && value >= 0;
}

/**
 * Catalog discovery and billing trust are intentionally separate. An endpoint
 * can be visible before its tariff has been reviewed, but it cannot enter a
 * route plan until the exact provider-model price is verified.
 */
export function isExecutableEndpoint(endpoint: ModelEndpoint) {
  if (endpoint.pricingVerified !== true) return false;
  const { prompt, completion } = endpoint.pricing;
  if (!validUnitPrice(prompt) || !validUnitPrice(completion)) return false;
  if (endpoint.free === true) return prompt === 0 && completion === 0;
  return prompt > 0 || completion > 0;
}

export function isFreeEndpoint(endpoint: ModelEndpoint) {
  return isExecutableEndpoint(endpoint) && endpoint.free === true;
}

export function executableEndpoints(model: CatalogModel) {
  return model.endpoints.filter(isExecutableEndpoint);
}

export function hasExecutableEndpoint(model: CatalogModel) {
  return model.endpoints.some(isExecutableEndpoint);
}

export function isTextGenerationModel(model: CatalogModel) {
  return (
    model.architecture.inputModalities.includes("text") &&
    model.architecture.outputModalities.includes("text")
  );
}

export function isEmbeddingModel(model: CatalogModel) {
  return model.architecture.outputModalities.includes("embeddings");
}

export function isTokenGatewayModel(model: CatalogModel) {
  return isTextGenerationModel(model) || isEmbeddingModel(model);
}
