import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GUEST_USER_ID,
  GUEST_EMAIL,
  assertGuestRateLimit,
  guestAuthContext,
} from "../src/lib/gateway/guest";

describe("guest playground", () => {
  it("exports stable guest identity", () => {
    assert.equal(GUEST_USER_ID, "usr_nexus_guest_playground");
    assert.ok(GUEST_EMAIL.includes("guest"));
  });

  it("isolates ephemeral guest identities by client IP", () => {
    const first = guestAuthContext(new Headers({ "x-forwarded-for": "198.51.100.10" }));
    const same = guestAuthContext(new Headers({ "x-forwarded-for": "198.51.100.10" }));
    const other = guestAuthContext(new Headers({ "x-forwarded-for": "198.51.100.11" }));
    assert.equal(first.userId, same.userId);
    assert.notEqual(first.userId, other.userId);
  });

  it("rate-limits guest IP after rpm", async () => {
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    const headers = new Headers({ "x-forwarded-for": ip });
    for (let i = 0; i < 8; i++) {
      await assertGuestRateLimit(headers, 8);
    }
    await assert.rejects(
      () => assertGuestRateLimit(headers, 8),
      (err: unknown) =>
        err instanceof Error && (err as Error & { status?: number }).status === 429,
    );
  });
});
