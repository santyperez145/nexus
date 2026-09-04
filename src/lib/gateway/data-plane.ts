/** Public inference protocols that must share auth, rate limiting and billing. */
export const DATA_PLANE_PROTOCOL_ROUTES = {
  chat: "/v1/chat/completions",
  completions: "/v1/completions",
  embeddings: "/v1/embeddings",
  rerank: "/v1/rerank",
  responses: "/v1/responses",
  messages: "/v1/messages",
} as const;

export type DataPlaneProtocol = keyof typeof DATA_PLANE_PROTOCOL_ROUTES;
