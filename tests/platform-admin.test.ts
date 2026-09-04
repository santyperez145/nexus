import assert from "node:assert/strict";
import test from "node:test";
import { isPlatformAdmin } from "../src/lib/config";

test("platform admin allowlist fails closed in every environment", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAdmins = process.env.ADMIN_EMAILS;
  try {
    for (const environment of ["development", "test", "production"]) {
      Reflect.set(process.env, "NODE_ENV", environment);
      Reflect.set(process.env, "ADMIN_EMAILS", "owner@nexus.test, ops@nexus.test");
      assert.equal(isPlatformAdmin(), false);
      assert.equal(isPlatformAdmin("unknown@nexus.test"), false);
      assert.equal(isPlatformAdmin(" OWNER@NEXUS.TEST ".trim()), true);
    }

    Reflect.deleteProperty(process.env, "ADMIN_EMAILS");
    assert.equal(isPlatformAdmin("owner@nexus.test"), false);
  } finally {
    if (previousNodeEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Reflect.set(process.env, "NODE_ENV", previousNodeEnv);
    if (previousAdmins === undefined) Reflect.deleteProperty(process.env, "ADMIN_EMAILS");
    else Reflect.set(process.env, "ADMIN_EMAILS", previousAdmins);
  }
});
