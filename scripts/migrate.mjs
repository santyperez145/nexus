import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import {
  LEGACY_BASELINE_TAG,
  MIGRATION_LOCK_KEY,
  assertDatabaseMatchesSnapshot,
  legacyDataStatements,
  readMigrationBundle,
  reconcileDatabaseCatalog,
  resolveMigrationDatabaseUrl,
} from "./migration-core.mjs";

const BASELINE_RECORD = `nexus:drizzle-baseline:${LEGACY_BASELINE_TAG}`;
const DRY_RUN_ROLLBACK = Symbol("dry-run-rollback");

async function migrationHistory(client) {
  const relation = await client.unsafe(
    "select to_regclass('drizzle.__drizzle_migrations')::text as relation",
  );
  if (!relation[0]?.relation) return { exists: false, count: 0, latestAt: null };
  const rows = await client.unsafe(
    "select count(*)::integer as count, max(created_at)::text as latest_at from drizzle.__drizzle_migrations",
  );
  return { exists: true, count: rows[0].count, latestAt: rows[0].latest_at };
}

async function publicTableCount(client) {
  const rows = await client.unsafe(`
    select count(*)::integer as count
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  `);
  return rows[0].count;
}

async function assertBaselineInvariants(client) {
  const checks = [
    {
      name: "legacy onboarding keys",
      query: `
        select count(*)::integer as count
        from api_key candidate
        join "user" owner on owner.id = candidate.user_id
        where candidate.name = 'Default'
          and candidate.last_used_at is null
          and candidate.disabled = false
          and candidate.created_at <= owner.created_at + interval '10 minutes'
          and (select count(*) from api_key sibling where sibling.user_id = candidate.user_id) = 1
      `,
    },
    {
      name: "legacy subscription credits",
      query: `select count(*)::integer as count from credit_ledger
              where type = 'purchase' and note like '%créditos mensuales incluidos'`,
    },
    {
      name: "ZDR policy",
      query: `select count(*)::integer as count from "user" where zdr = true and log_prompts = true`,
    },
    {
      name: "retained private generation content",
      query: `
        select count(*)::integer as count
        from generation
        where user_id in (select id from "user" where zdr = true or log_prompts = false)
          and (prompt is not null or completion is not null or metadata ? 'filename')
      `,
    },
    {
      name: "retained private video prompts",
      query: `
        select count(*)::integer as count
        from video_job
        where user_id in (select id from "user" where zdr = true or log_prompts = false)
          and prompt is not null
      `,
    },
    {
      name: "retained ZDR video results",
      query: `
        select count(*)::integer as count
        from video_job
        where user_id in (select id from "user" where zdr = true) and result_url is not null
      `,
    },
    {
      name: "orphaned BYOK credentials",
      query: `
        select count(*)::integer as count
        from byok_credential credential
        where credential.workspace_id is not null
          and not exists (select 1 from workspace where workspace.id = credential.workspace_id)
      `,
    },
    {
      name: "duplicate account BYOK credentials",
      query: `
        select count(*)::integer as count from (
          select 1 from byok_credential
          where deleted = false and workspace_id is null
          group by user_id, provider having count(*) > 1
        ) duplicate
      `,
    },
    {
      name: "duplicate workspace BYOK credentials",
      query: `
        select count(*)::integer as count from (
          select 1 from byok_credential
          where deleted = false and workspace_id is not null
          group by workspace_id, provider having count(*) > 1
        ) duplicate
      `,
    },
    {
      name: "workspace ownership",
      query: `
        select count(*)::integer as count
        from workspace join organization on organization.id = workspace.organization_id
        where workspace.user_id <> organization.owner_id
      `,
    },
    {
      name: "organization default workspaces",
      query: `
        select count(*)::integer as count from (
          select organization_id from workspace where organization_id is not null
          group by organization_id having bool_or(is_default) = false
        ) organization_without_default
      `,
    },
    {
      name: "workspace memberships",
      query: `
        select count(*)::integer as count
        from workspace
        join organization_member member on member.organization_id = workspace.organization_id
        left join workspace_member on workspace_member.workspace_id = workspace.id
          and workspace_member.user_id = member.user_id
        where workspace_member.id is null
      `,
    },
  ];

  const failures = [];
  for (const check of checks) {
    const rows = await client.unsafe(check.query);
    if (rows[0].count > 0) failures.push(`${check.name}: ${rows[0].count}`);
  }
  if (failures.length) throw new Error(`Baseline data invariants failed:\n- ${failures.join("\n- ")}`);
}

async function applyLegacyBaseline(client, bundle, apply) {
  let dryRunComplete = false;
  let reconciledObjects = 0;
  try {
    await client.begin(async (transaction) => {
      await transaction.unsafe(`select pg_advisory_xact_lock(hashtext('${MIGRATION_LOCK_KEY}'))`);
      const history = await migrationHistory(transaction);
      if (history.count > 0) {
        throw new Error("Drizzle migration history already exists; legacy baseline is not allowed");
      }

      reconciledObjects = await reconcileDatabaseCatalog(transaction, bundle.baselineSnapshot);
      const dataStatements = legacyDataStatements(bundle.baselineMigrations);
      for (const migration of dataStatements) await transaction.unsafe(migration.statement);
      await assertBaselineInvariants(transaction);

      await transaction.unsafe("create schema if not exists drizzle");
      await transaction.unsafe(`
        create table if not exists drizzle.__drizzle_migrations (
          id serial primary key,
          hash text not null,
          created_at bigint
        )
      `);
      for (const migration of bundle.baselineMigrations) {
        await transaction.unsafe(
          "insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)",
          [migration.hash, migration.when],
        );
      }
      await transaction.unsafe(
        "insert into public.schema_migrations (id) values ($1) on conflict (id) do nothing",
        [BASELINE_RECORD],
      );

      if (!apply) {
        dryRunComplete = true;
        throw DRY_RUN_ROLLBACK;
      }
    });
  } catch (error) {
    if (error !== DRY_RUN_ROLLBACK) throw error;
  }
  if (!apply && !dryRunComplete) throw new Error("Baseline dry-run did not complete");

  console.info(
    apply
      ? `Legacy database baseline applied through ${LEGACY_BASELINE_TAG}`
      : `Legacy database baseline dry-run passed through ${LEGACY_BASELINE_TAG}; no changes committed`,
  );
  console.info(`${reconciledObjects} legacy schema objects normalized to the Drizzle snapshot`);
}

async function runMigrations(client, bundle) {
  await client.unsafe(`select pg_advisory_lock(hashtext('${MIGRATION_LOCK_KEY}'))`);
  try {
    const history = await migrationHistory(client);
    const tableCount = await publicTableCount(client);
    if (tableCount > 0 && history.count === 0) {
      throw new Error(
        "Existing database has no Drizzle history. Run `node scripts/migrate.mjs baseline` and then rerun with `--apply` after review.",
      );
    }
    await migrate(drizzle(client), { migrationsFolder: bundle.migrationsFolder });
    await assertDatabaseMatchesSnapshot(client, bundle.latestSnapshot);

    const updatedHistory = await migrationHistory(client);
    if (Number(updatedHistory.latestAt) !== bundle.latest.when) {
      throw new Error("Migration history does not end at the latest journal entry");
    }
    console.info(`Nexus database migrations applied through ${bundle.latest.tag}`);
  } finally {
    await client.unsafe(`select pg_advisory_unlock(hashtext('${MIGRATION_LOCK_KEY}'))`);
  }
}

const [command = "migrate", ...flags] = process.argv.slice(2);
const bundle = readMigrationBundle();
const databaseUrl = resolveMigrationDatabaseUrl(process.env);
const client = postgres(databaseUrl, { max: 1, prepare: false });

try {
  if (command === "baseline") {
    const unknownFlags = flags.filter((flag) => flag !== "--apply");
    if (unknownFlags.length) throw new Error(`Unknown baseline option: ${unknownFlags.join(", ")}`);
    await applyLegacyBaseline(client, bundle, flags.includes("--apply"));
  } else if (command === "migrate" && flags.length === 0) {
    await runMigrations(client, bundle);
  } else {
    throw new Error("Usage: node scripts/migrate.mjs migrate | baseline [--apply]");
  }
} finally {
  await client.end();
}
