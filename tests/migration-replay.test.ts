import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const client = new PGlite();

before(async () => {
  await migrate(drizzle(client), { migrationsFolder: "drizzle" });
});

after(async () => {
  await client.close();
});

describe("fresh migration replay", () => {
  it("applies every reviewed migration and creates the multipart artifact shape", async () => {
    const migrationResult = await client.query<{ count: number }>(
      "select count(*)::integer as count from drizzle.__drizzle_migrations",
    );
    assert.equal(migrationResult.rows[0]?.count, 17);

    const columnResult = await client.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'file' order by ordinal_position",
    );
    const columns = columnResult.rows.map((row) => row.column_name);
    assert.ok(columns.includes("storage_upload_id"));
    assert.ok(columns.includes("storage_part_size"));

    await client.query(`
      insert into "user" (id, name, email, plan)
      values ('usr_multipart_migration', 'Migration', 'migration@nexus.test', 'team')
    `);
    await client.query(`
      insert into "file" (
        id, user_id, filename, mime, size, storage_backend, storage_key,
        storage_upload_id, storage_part_size, checksum_sha256, status, upload_expires_at
      ) values (
        'file_multipart_migration', 'usr_multipart_migration', 'weights.safetensors',
        'application/octet-stream', 53687091200, 's3', 'nexus-artifacts/test',
        'upload_123', 67108864, repeat('a', 64), 'completing', now() + interval '15 minutes'
      )
    `);
    const fileResult = await client.query<{ size: string; status: string }>(
      "select size::text as size, status from \"file\" where id = 'file_multipart_migration'",
    );
    assert.deepEqual(fileResult.rows[0], { size: "53687091200", status: "completing" });
  });
});
