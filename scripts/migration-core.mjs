import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const LEGACY_BASELINE_TAG = "0009_dark_franklin_richards";
export const MIGRATION_LOCK_KEY = "nexus:drizzle:migrate";

const LEGACY_DATA_MIGRATIONS = new Set([
  "0003_third_ender_wiggin",
  "0005_loud_lyja",
  "0007_classify_subscription_credits",
  "0008_broad_boom_boom",
  "0009_dark_franklin_richards",
]);

const FOREIGN_KEY_ACTIONS = {
  a: "no action",
  r: "restrict",
  c: "cascade",
  n: "set null",
  d: "set default",
};

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function key(table, name) {
  return `${table}.${name}`;
}

function normalizeType(type) {
  if (type === "timestamp") return "timestamp without time zone";
  return type.toLowerCase();
}

function normalizePredicate(value, table) {
  if (!value) return null;
  return value
    .toLowerCase()
    .replaceAll('"', "")
    .replaceAll(`${table}.`, "")
    .replaceAll("(", "")
    .replaceAll(")", "")
    .replace(
      /::(?:text|boolean|smallint|integer|bigint|numeric|real|double precision|jsonb?|timestamp(?: with(?:out)? time zone)?)/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function resolveMigrationDatabaseUrl(env) {
  const direct = env.DATABASE_URL_UNPOOLED ?? env.POSTGRES_URL_NON_POOLING;
  if (env.NODE_ENV === "production" && !direct) {
    throw new Error("DATABASE_URL_UNPOOLED is required for production migrations");
  }
  const value = direct ?? env.DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required to run migrations");
  }

  let host;
  try {
    host = new URL(value).hostname;
  } catch {
    throw new Error("Migration database URL is invalid");
  }
  if (host.includes("-pooler")) {
    throw new Error("Migrations require a direct database URL, not a pooled Neon endpoint");
  }
  return value;
}

export function readMigrationBundle(root = process.cwd(), baselineTag = LEGACY_BASELINE_TAG) {
  const migrationsFolder = resolve(root, "drizzle");
  const journal = JSON.parse(readFileSync(resolve(migrationsFolder, "meta", "_journal.json"), "utf8"));
  const baselineIndex = journal.entries.findIndex((entry) => entry.tag === baselineTag);
  if (baselineIndex < 0) throw new Error(`Legacy baseline ${baselineTag} is missing from the journal`);

  const migrations = journal.entries.map((entry) => {
    const source = readFileSync(resolve(migrationsFolder, `${entry.tag}.sql`), "utf8");
    return {
      ...entry,
      hash: createHash("sha256").update(source).digest("hex"),
      statements: source.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean),
    };
  });
  const baselineMigrations = migrations.slice(0, baselineIndex + 1);
  const baselineSnapshot = JSON.parse(
    readFileSync(resolve(migrationsFolder, "meta", `${baselineTag.slice(0, 4)}_snapshot.json`), "utf8"),
  );
  const latest = migrations.at(-1);
  const latestSnapshot = JSON.parse(
    readFileSync(resolve(migrationsFolder, "meta", `${latest.tag.slice(0, 4)}_snapshot.json`), "utf8"),
  );

  return { migrationsFolder, migrations, baselineMigrations, baselineSnapshot, latest, latestSnapshot };
}

export function legacyDataStatements(migrations) {
  return migrations.flatMap((migration) => {
    if (!LEGACY_DATA_MIGRATIONS.has(migration.tag)) return [];
    return migration.statements
      .filter((statement) => /^(update|with|insert)\b/i.test(statement))
      .map((statement) => ({ tag: migration.tag, statement }));
  });
}

export function expectedCatalog(snapshot) {
  const tables = [];
  const columns = [];
  const primaryKeys = [];
  const indexes = [];
  const foreignKeys = [];

  for (const [qualifiedName, table] of Object.entries(snapshot.tables)) {
    const [schema, tableName] = qualifiedName.split(".");
    if (schema !== "public") continue;
    tables.push(tableName);

    const singlePrimaryKey = [];
    for (const column of Object.values(table.columns)) {
      columns.push({
        table: tableName,
        name: column.name,
        type: normalizeType(column.type),
        nullable: !column.notNull,
      });
      if (column.primaryKey) singlePrimaryKey.push(column.name);
    }
    if (singlePrimaryKey.length) primaryKeys.push({ table: tableName, columns: singlePrimaryKey });
    for (const primaryKey of Object.values(table.compositePrimaryKeys ?? {})) {
      primaryKeys.push({ table: tableName, columns: primaryKey.columns });
    }

    for (const index of Object.values(table.indexes ?? {})) {
      indexes.push({
        table: tableName,
        name: index.name,
        columns: index.columns.map((column) => column.expression),
        unique: index.isUnique,
        method: index.method,
        predicate: normalizePredicate(index.where, tableName),
        constraint: false,
      });
    }
    for (const constraint of Object.values(table.uniqueConstraints ?? {})) {
      indexes.push({
        table: tableName,
        name: constraint.name,
        columns: constraint.columns,
        unique: true,
        method: "btree",
        predicate: null,
        constraint: true,
      });
    }

    for (const foreignKey of Object.values(table.foreignKeys ?? {})) {
      foreignKeys.push({
        table: tableName,
        name: foreignKey.name,
        targetTable: foreignKey.tableTo,
        columns: foreignKey.columnsFrom,
        targetColumns: foreignKey.columnsTo,
        onDelete: foreignKey.onDelete,
        onUpdate: foreignKey.onUpdate,
      });
    }
  }

  return { tables, columns, primaryKeys, indexes, foreignKeys };
}

export function compareCatalog(expected, actual) {
  const problems = [];
  const expectedTables = sorted(expected.tables);
  const actualTables = sorted(actual.tables);
  if (!arraysEqual(expectedTables, actualTables)) {
    const missing = expectedTables.filter((table) => !actualTables.includes(table));
    const extra = actualTables.filter((table) => !expectedTables.includes(table));
    if (missing.length) problems.push(`missing tables: ${missing.join(", ")}`);
    if (extra.length) problems.push(`unexpected tables: ${extra.join(", ")}`);
  }

  const actualColumns = new Map(actual.columns.map((column) => [key(column.table, column.name), column]));
  const expectedColumnKeys = new Set();
  for (const column of expected.columns) {
    const columnKey = key(column.table, column.name);
    expectedColumnKeys.add(columnKey);
    const found = actualColumns.get(columnKey);
    if (!found) {
      problems.push(`missing column: ${columnKey}`);
      continue;
    }
    if (normalizeType(found.type) !== column.type || found.nullable !== column.nullable) {
      problems.push(
        `column mismatch: ${columnKey} expected ${column.type} ${column.nullable ? "nullable" : "not null"}`,
      );
    }
  }
  for (const column of actual.columns) {
    const columnKey = key(column.table, column.name);
    if (!expectedColumnKeys.has(columnKey)) problems.push(`unexpected column: ${columnKey}`);
  }

  const actualPrimaryKeys = new Map(actual.primaryKeys.map((item) => [item.table, item]));
  for (const primaryKey of expected.primaryKeys) {
    const found = actualPrimaryKeys.get(primaryKey.table);
    if (!found || !arraysEqual(found.columns, primaryKey.columns)) {
      problems.push(`primary key mismatch: ${primaryKey.table}`);
    }
  }
  for (const primaryKey of actual.primaryKeys) {
    if (!expected.primaryKeys.some((item) => item.table === primaryKey.table)) {
      problems.push(`unexpected primary key: ${primaryKey.table}`);
    }
  }

  const actualIndexes = new Map(actual.indexes.map((index) => [key(index.table, index.name), index]));
  const expectedIndexKeys = new Set();
  for (const index of expected.indexes) {
    const indexKey = key(index.table, index.name);
    expectedIndexKeys.add(indexKey);
    const found = actualIndexes.get(indexKey);
    if (
      !found ||
      found.unique !== index.unique ||
      found.method !== index.method ||
      found.constraint !== index.constraint ||
      !arraysEqual(found.columns, index.columns) ||
      normalizePredicate(found.predicate, index.table) !== index.predicate
    ) {
      problems.push(`index mismatch: ${indexKey}`);
    }
  }
  for (const index of actual.indexes) {
    const indexKey = key(index.table, index.name);
    if (!expectedIndexKeys.has(indexKey)) problems.push(`unexpected index: ${indexKey}`);
  }

  const actualForeignKeys = new Map(
    actual.foreignKeys.map((foreignKey) => [key(foreignKey.table, foreignKey.name), foreignKey]),
  );
  const expectedForeignKeyKeys = new Set();
  for (const foreignKey of expected.foreignKeys) {
    const foreignKeyKey = key(foreignKey.table, foreignKey.name);
    expectedForeignKeyKeys.add(foreignKeyKey);
    const found = actualForeignKeys.get(foreignKeyKey);
    if (
      !found ||
      found.targetTable !== foreignKey.targetTable ||
      !arraysEqual(found.columns, foreignKey.columns) ||
      !arraysEqual(found.targetColumns, foreignKey.targetColumns) ||
      found.onDelete !== foreignKey.onDelete ||
      found.onUpdate !== foreignKey.onUpdate
    ) {
      problems.push(`foreign key mismatch: ${foreignKeyKey}`);
    }
  }
  for (const foreignKey of actual.foreignKeys) {
    const foreignKeyKey = key(foreignKey.table, foreignKey.name);
    if (!expectedForeignKeyKeys.has(foreignKeyKey)) {
      problems.push(`unexpected foreign key: ${foreignKeyKey}`);
    }
  }

  return problems;
}

export async function readDatabaseCatalog(client) {
  const [tableRows, columnRows, primaryKeyRows, indexRows, foreignKeyRows] = await Promise.all([
    client.unsafe(`
      select table_name
      from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name
    `),
    client.unsafe(`
      select table_name, column_name, data_type, is_nullable
      from information_schema.columns
      where table_schema = 'public'
      order by table_name, ordinal_position
    `),
    client.unsafe(`
      select source.relname as table_name,
             array_agg(attribute.attname order by part.ordinality) as columns
      from pg_constraint constraint_row
      join pg_class source on source.oid = constraint_row.conrelid
      join pg_namespace namespace on namespace.oid = source.relnamespace
      cross join lateral unnest(constraint_row.conkey) with ordinality as part(attnum, ordinality)
      join pg_attribute attribute on attribute.attrelid = source.oid and attribute.attnum = part.attnum
      where namespace.nspname = 'public' and constraint_row.contype = 'p'
      group by source.relname
      order by source.relname
    `),
    client.unsafe(`
      select source.relname as table_name,
             target.relname as index_name,
             index_row.indisunique as is_unique,
             access_method.amname as method,
             array_agg(attribute.attname order by part.ordinality) as columns,
             pg_get_expr(index_row.indpred, index_row.indrelid) as predicate,
             constraint_index.oid is not null as is_constraint
      from pg_index index_row
      join pg_class source on source.oid = index_row.indrelid
      join pg_namespace namespace on namespace.oid = source.relnamespace
      join pg_class target on target.oid = index_row.indexrelid
      join pg_am access_method on access_method.oid = target.relam
      left join pg_constraint constraint_index on constraint_index.conindid = target.oid
      cross join lateral unnest(index_row.indkey) with ordinality as part(attnum, ordinality)
      join pg_attribute attribute on attribute.attrelid = source.oid and attribute.attnum = part.attnum
      where namespace.nspname = 'public' and index_row.indisprimary = false
      group by source.relname, target.relname, index_row.indisunique, access_method.amname,
               index_row.indpred, index_row.indrelid, constraint_index.oid
      order by source.relname, target.relname
    `),
    client.unsafe(`
      select constraint_row.conname,
             source.relname as table_name,
             target.relname as target_table,
             array_agg(source_attribute.attname order by source_part.ordinality) as columns,
             array_agg(target_attribute.attname order by source_part.ordinality) as target_columns,
             constraint_row.confdeltype,
             constraint_row.confupdtype
      from pg_constraint constraint_row
      join pg_class source on source.oid = constraint_row.conrelid
      join pg_namespace namespace on namespace.oid = source.relnamespace
      join pg_class target on target.oid = constraint_row.confrelid
      cross join lateral unnest(constraint_row.conkey) with ordinality as source_part(attnum, ordinality)
      join lateral unnest(constraint_row.confkey) with ordinality as target_part(attnum, ordinality)
        on target_part.ordinality = source_part.ordinality
      join pg_attribute source_attribute
        on source_attribute.attrelid = source.oid and source_attribute.attnum = source_part.attnum
      join pg_attribute target_attribute
        on target_attribute.attrelid = target.oid and target_attribute.attnum = target_part.attnum
      where namespace.nspname = 'public' and constraint_row.contype = 'f'
      group by constraint_row.conname, source.relname, target.relname,
               constraint_row.confdeltype, constraint_row.confupdtype
      order by source.relname, constraint_row.conname
    `),
  ]);

  return {
    tables: tableRows.map((row) => row.table_name),
    columns: columnRows.map((row) => ({
      table: row.table_name,
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable === "YES",
    })),
    primaryKeys: primaryKeyRows.map((row) => ({ table: row.table_name, columns: row.columns })),
    indexes: indexRows.map((row) => ({
      table: row.table_name,
      name: row.index_name,
      unique: row.is_unique,
      method: row.method,
      columns: row.columns,
      predicate: row.predicate,
      constraint: row.is_constraint,
    })),
    foreignKeys: foreignKeyRows.map((row) => ({
      table: row.table_name,
      name: row.conname,
      targetTable: row.target_table,
      columns: row.columns,
      targetColumns: row.target_columns,
      onDelete: FOREIGN_KEY_ACTIONS[row.confdeltype],
      onUpdate: FOREIGN_KEY_ACTIONS[row.confupdtype],
    })),
  };
}

export async function assertDatabaseMatchesSnapshot(client, snapshot) {
  const problems = compareCatalog(expectedCatalog(snapshot), await readDatabaseCatalog(client));
  if (problems.length) {
    throw new Error(`Database schema does not match the expected Drizzle snapshot:\n- ${problems.join("\n- ")}`);
  }
}

function indexSignature(index) {
  return JSON.stringify([
    index.table,
    index.unique,
    index.method,
    index.columns,
    normalizePredicate(index.predicate, index.table),
  ]);
}

function foreignKeySignature(foreignKey) {
  return JSON.stringify([
    foreignKey.table,
    foreignKey.targetTable,
    foreignKey.columns,
    foreignKey.targetColumns,
    foreignKey.onDelete,
    foreignKey.onUpdate,
  ]);
}

function signatureCounts(items, signature) {
  const counts = new Map();
  for (const item of items) {
    const value = signature(item);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function equalCounts(left, right) {
  if (left.size !== right.size) return false;
  return [...left].every(([signature, count]) => right.get(signature) === count);
}

export function compareCatalogSemantics(expected, actual) {
  const structuralProblems = compareCatalog(
    { ...expected, indexes: [], foreignKeys: [] },
    { ...actual, indexes: [], foreignKeys: [] },
  );
  if (
    !equalCounts(
      signatureCounts(expected.indexes, indexSignature),
      signatureCounts(actual.indexes, indexSignature),
    )
  ) {
    structuralProblems.push("index definitions differ from the expected snapshot");
  }
  if (
    !equalCounts(
      signatureCounts(expected.foreignKeys, foreignKeySignature),
      signatureCounts(actual.foreignKeys, foreignKeySignature),
    )
  ) {
    structuralProblems.push("foreign key definitions differ from the expected snapshot");
  }
  return structuralProblems;
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function takeSemanticMatch(items, signature, consumed) {
  const index = items.findIndex((item, position) => !consumed.has(position) && signature(item));
  if (index < 0) return null;
  consumed.add(index);
  return items[index];
}

export async function reconcileDatabaseCatalog(client, snapshot) {
  const expected = expectedCatalog(snapshot);
  const actual = await readDatabaseCatalog(client);
  const semanticProblems = compareCatalogSemantics(expected, actual);
  if (semanticProblems.length) {
    throw new Error(
      `Database is not semantically compatible with the expected Drizzle snapshot:\n- ${semanticProblems.join("\n- ")}`,
    );
  }

  let changes = 0;
  const consumedIndexes = new Set();
  for (const expectedIndex of expected.indexes) {
    const signature = indexSignature(expectedIndex);
    const found = takeSemanticMatch(
      actual.indexes,
      (index) => indexSignature(index) === signature,
      consumedIndexes,
    );
    if (!found) throw new Error(`Compatible index disappeared: ${expectedIndex.name}`);
    if (found.name === expectedIndex.name && found.constraint === expectedIndex.constraint) continue;

    const tableName = quoteIdentifier(expectedIndex.table);
    const foundName = quoteIdentifier(found.name);
    const expectedName = quoteIdentifier(expectedIndex.name);
    if (found.constraint && expectedIndex.constraint) {
      await client.unsafe(
        `alter table public.${tableName} rename constraint ${foundName} to ${expectedName}`,
      );
    } else if (found.constraint) {
      await client.unsafe(`alter table public.${tableName} drop constraint ${foundName}`);
      const columns = expectedIndex.columns.map(quoteIdentifier).join(", ");
      const predicate = expectedIndex.predicate ? ` where ${expectedIndex.predicate}` : "";
      await client.unsafe(
        `create ${expectedIndex.unique ? "unique " : ""}index ${expectedName} on public.${tableName} using ${expectedIndex.method} (${columns})${predicate}`,
      );
    } else if (expectedIndex.constraint) {
      if (expectedIndex.predicate) {
        throw new Error(`Cannot convert partial index ${found.name} into a unique constraint`);
      }
      await client.unsafe(`drop index public.${foundName}`);
      const columns = expectedIndex.columns.map(quoteIdentifier).join(", ");
      await client.unsafe(
        `alter table public.${tableName} add constraint ${expectedName} unique (${columns})`,
      );
    } else {
      await client.unsafe(`alter index public.${foundName} rename to ${expectedName}`);
    }
    changes += 1;
  }

  const consumedForeignKeys = new Set();
  for (const expectedForeignKey of expected.foreignKeys) {
    const signature = foreignKeySignature(expectedForeignKey);
    const found = takeSemanticMatch(
      actual.foreignKeys,
      (foreignKey) => foreignKeySignature(foreignKey) === signature,
      consumedForeignKeys,
    );
    if (!found) throw new Error(`Compatible foreign key disappeared: ${expectedForeignKey.name}`);
    if (found.name === expectedForeignKey.name) continue;
    await client.unsafe(
      `alter table public.${quoteIdentifier(expectedForeignKey.table)} rename constraint ${quoteIdentifier(found.name)} to ${quoteIdentifier(expectedForeignKey.name)}`,
    );
    changes += 1;
  }

  await assertDatabaseMatchesSnapshot(client, snapshot);
  return changes;
}
