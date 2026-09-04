import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareCatalog,
  compareCatalogSemantics,
  expectedCatalog,
  legacyDataStatements,
  readMigrationBundle,
  resolveMigrationDatabaseUrl,
} from "../scripts/migration-core.mjs";

function clone<T>(value: T): T {
  return structuredClone(value);
}

describe("production migration runner", () => {
  it("requires a direct database URL in production", () => {
    assert.throws(
      () => resolveMigrationDatabaseUrl({ NODE_ENV: "production", DATABASE_URL: "postgres://u:p@db/x" }),
      /DATABASE_URL_UNPOOLED/,
    );
    assert.throws(
      () =>
        resolveMigrationDatabaseUrl({
          NODE_ENV: "production",
          DATABASE_URL_UNPOOLED: "postgres://u:p@ep-name-pooler.us-east-2.aws.neon.tech/x",
        }),
      /direct database URL/,
    );
  });

  it("pins the legacy baseline and replays only its reviewed data migrations", () => {
    const bundle = readMigrationBundle();
    assert.equal(bundle.baselineMigrations.at(-1)?.tag, "0009_dark_franklin_richards");
    assert.equal(bundle.latest.tag, "0013_romantic_thena");
    assert.deepEqual(
      [
        ...new Set(
          legacyDataStatements(bundle.baselineMigrations).map((item: { tag: string }) => item.tag),
        ),
      ],
      [
        "0003_third_ender_wiggin",
        "0005_loud_lyja",
        "0007_classify_subscription_credits",
        "0008_broad_boom_boom",
        "0009_dark_franklin_richards",
      ],
    );
  });

  it("detects schema drift instead of baselining it", () => {
    const expected = expectedCatalog(readMigrationBundle().baselineSnapshot);
    const actual = clone(expected);
    assert.deepEqual(compareCatalog(expected, actual), []);

    actual.columns.find(
      (column: { table: string; name: string }) => column.table === "user" && column.name === "zdr",
    )!.nullable = true;
    actual.indexes = actual.indexes.filter(
      (index: { name: string }) => index.name !== "byok_workspace_provider_active_uidx",
    );
    actual.foreignKeys.find(
      (foreignKey: { name: string }) =>
        foreignKey.name === "byok_credential_workspace_id_workspace_id_fk",
    )!.onDelete = "set null";

    assert.deepEqual(compareCatalog(expected, actual), [
      "column mismatch: user.zdr expected boolean not null",
      "index mismatch: byok_credential.byok_workspace_provider_active_uidx",
      "foreign key mismatch: byok_credential.byok_credential_workspace_id_workspace_id_fk",
    ]);
  });

  it("normalizes PostgreSQL casts without consuming the next predicate clause", () => {
    const expected = {
      tables: ["credit_ledger"],
      columns: [],
      primaryKeys: [],
      indexes: [
        {
          table: "credit_ledger",
          name: "ledger_purchase_payment_intent_uidx",
          columns: ["stripe_payment_intent_id"],
          unique: true,
          method: "btree",
          predicate: "type = 'purchase' and stripe_payment_intent_id is not null",
          constraint: false,
        },
      ],
      foreignKeys: [],
    };
    const actual = clone(expected);
    actual.indexes[0].predicate =
      "((credit_ledger.type = 'purchase'::text) AND (credit_ledger.stripe_payment_intent_id IS NOT NULL))";
    assert.deepEqual(compareCatalog(expected, actual), []);
  });

  it("accepts legacy constraint names only for the reconciliation pass", () => {
    const expected = expectedCatalog(readMigrationBundle().baselineSnapshot);
    const actual = clone(expected);
    const index = actual.indexes.find(
      (item: { name: string }) => item.name === "workspace_slug_user",
    )!;
    index.name = "workspace_user_id_slug_key";
    index.constraint = true;
    actual.foreignKeys[0].name = "legacy_fkey";

    assert.equal(compareCatalog(expected, actual).length, 4);
    assert.deepEqual(compareCatalogSemantics(expected, actual), []);
  });
});
