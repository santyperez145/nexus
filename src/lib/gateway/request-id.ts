import { AsyncLocalStorage } from "node:async_hooks";

const store = new AsyncLocalStorage<{ requestId: string }>();

export function requestIdFrom(req: Request) {
  return req.headers.get("x-request-id")?.trim() || crypto.randomUUID();
}

export function bindRequestId(req: Request) {
  const existing = store.getStore()?.requestId;
  const requestId = existing || requestIdFrom(req);
  store.enterWith({ requestId });
  return requestId;
}

export function currentRequestId() {
  return store.getStore()?.requestId;
}
