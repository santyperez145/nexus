export function hasAuthCredentials(req: Request) {
  return Boolean(
    req.headers.get("authorization")?.trim() ||
      req.headers.get("cookie")?.trim() ||
      req.headers.get("x-nexus-guest") === "1",
  );
}
