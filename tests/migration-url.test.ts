import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveMigrationDatabaseUrl } from "../src/lib/db/migration-url";

describe("migration connection safety", () => {
  it("requires the explicit direct URL in production", () => {
    assert.throws(
      () => resolveMigrationDatabaseUrl({ NODE_ENV: "production", DATABASE_URL: "postgres://u:p@db/x" }),
      /DATABASE_URL_UNPOOLED/,
    );
  });

  it("rejects Neon pooler hosts", () => {
    assert.throws(
      () => resolveMigrationDatabaseUrl({ DATABASE_URL_UNPOOLED: "postgres://u:p@ep-name-pooler.us-east-2.aws.neon.tech/x" }),
      /direct database URL/,
    );
  });

  it("accepts a direct migration connection", () => {
    const url = "postgres://u:p@ep-name.us-east-2.aws.neon.tech/x";
    assert.equal(resolveMigrationDatabaseUrl({ NODE_ENV: "production", DATABASE_URL_UNPOOLED: url }), url);
  });
});
