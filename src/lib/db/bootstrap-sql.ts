export const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS "user" (
    id text PRIMARY KEY,
    name text NOT NULL,
    email text NOT NULL UNIQUE,
    email_verified boolean NOT NULL DEFAULT false,
    image text,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    credit_micros bigint NOT NULL DEFAULT 0,
    default_model text DEFAULT 'nexus/auto',
    allow_training boolean NOT NULL DEFAULT true,
    zdr boolean NOT NULL DEFAULT false,
    log_prompts boolean NOT NULL DEFAULT false,
    auto_topup_enabled boolean NOT NULL DEFAULT false,
    auto_topup_threshold_usd numeric,
    auto_topup_amount_usd numeric,
    stripe_customer_id text
  )`,
  `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS stripe_customer_id text`,
  `CREATE UNIQUE INDEX IF NOT EXISTS user_stripe_customer_id_idx ON "user"(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL`,
  `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free'`,
  `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'inactive'`,
  `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS notify_low_balance boolean NOT NULL DEFAULT true`,
  `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS notify_key_limit boolean NOT NULL DEFAULT true`,
  `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS notify_org_invite boolean NOT NULL DEFAULT true`,
  `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS low_balance_threshold_usd numeric DEFAULT 5`,
  `ALTER TABLE "user" ALTER COLUMN allow_training SET DEFAULT true`,
  `CREATE TABLE IF NOT EXISTS "session" (
    id text PRIMARY KEY,
    expires_at timestamp NOT NULL,
    token text NOT NULL UNIQUE,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    ip_address text,
    user_agent text,
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS session_user_idx ON "session"(user_id)`,
  `CREATE TABLE IF NOT EXISTS "account" (
    id text PRIMARY KEY,
    account_id text NOT NULL,
    provider_id text NOT NULL,
    issuer text NOT NULL DEFAULT '',
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    access_token text,
    refresh_token text,
    id_token text,
    access_token_expires_at timestamp,
    refresh_token_expires_at timestamp,
    scope text,
    password text,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS account_user_idx ON "account"(user_id)`,
  `ALTER TABLE "account" ADD COLUMN IF NOT EXISTS issuer text NOT NULL DEFAULT ''`,
  `CREATE TABLE IF NOT EXISTS "verification" (
    id text PRIMARY KEY,
    identifier text NOT NULL,
    value text NOT NULL,
    expires_at timestamp NOT NULL,
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "organization" (
    id text PRIMARY KEY,
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    owner_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "organization_member" (
    id text PRIMARY KEY,
    organization_id text NOT NULL REFERENCES "organization"(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'member',
    created_at timestamp NOT NULL DEFAULT now(),
    UNIQUE (organization_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS "organization_invite" (
    id text PRIMARY KEY,
    organization_id text NOT NULL REFERENCES "organization"(id) ON DELETE CASCADE,
    email text NOT NULL,
    role text NOT NULL DEFAULT 'member',
    token text NOT NULL UNIQUE,
    invited_by text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    accepted_at timestamp,
    expires_at timestamp NOT NULL,
    created_at timestamp NOT NULL DEFAULT now(),
    UNIQUE (organization_id, email)
  )`,
  `CREATE TABLE IF NOT EXISTS "workspace" (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    organization_id text REFERENCES "organization"(id) ON DELETE SET NULL,
    name text NOT NULL,
    slug text NOT NULL,
    is_default boolean NOT NULL DEFAULT false,
    include_byok_in_budgets boolean NOT NULL DEFAULT false,
    created_at timestamp NOT NULL DEFAULT now(),
    UNIQUE (user_id, slug)
  )`,
  `CREATE TABLE IF NOT EXISTS "workspace_member" (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES "workspace"(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    created_at timestamp NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS workspace_member_user_idx ON "workspace_member"(user_id)`,
  `CREATE TABLE IF NOT EXISTS "workspace_budget" (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES "workspace"(id) ON DELETE CASCADE,
    interval text NOT NULL,
    limit_micros bigint NOT NULL,
    spent_micros bigint NOT NULL DEFAULT 0,
    UNIQUE (workspace_id, interval)
  )`,
  `CREATE TABLE IF NOT EXISTS "api_key" (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    workspace_id text REFERENCES "workspace"(id) ON DELETE SET NULL,
    name text NOT NULL,
    key_hash text NOT NULL UNIQUE,
    key_prefix text NOT NULL,
    is_management boolean NOT NULL DEFAULT false,
    scopes jsonb,
    disabled boolean NOT NULL DEFAULT false,
    pending_reveal boolean NOT NULL DEFAULT false,
    limit_micros bigint,
    usage_micros bigint NOT NULL DEFAULT 0,
    limit_reset text,
    include_byok_in_limit boolean NOT NULL DEFAULT false,
    last_used_at timestamp,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS api_key_user_idx ON "api_key"(user_id)`,
  `ALTER TABLE "api_key" ADD COLUMN IF NOT EXISTS scopes jsonb`,
  `ALTER TABLE "api_key" ADD COLUMN IF NOT EXISTS pending_reveal boolean NOT NULL DEFAULT false`,
  `CREATE UNIQUE INDEX IF NOT EXISTS api_key_pending_reveal_user_uidx ON "api_key"(user_id) WHERE pending_reveal = true`,
  `CREATE TABLE IF NOT EXISTS "credit_ledger" (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    type text NOT NULL,
    micros bigint NOT NULL,
    stripe_session_id text,
    stripe_payment_intent_id text,
    stripe_amount_minor integer,
    stripe_currency text,
    generation_id text,
    note text,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS ledger_user_idx ON "credit_ledger"(user_id)`,
  `ALTER TABLE "credit_ledger" ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text`,
  `ALTER TABLE "credit_ledger" ADD COLUMN IF NOT EXISTS stripe_amount_minor integer`,
  `ALTER TABLE "credit_ledger" ADD COLUMN IF NOT EXISTS stripe_currency text`,
  `CREATE INDEX IF NOT EXISTS ledger_stripe_payment_intent_idx ON "credit_ledger"(stripe_payment_intent_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ledger_stripe_session_uidx ON "credit_ledger"(stripe_session_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ledger_purchase_payment_intent_uidx ON "credit_ledger"(stripe_payment_intent_id) WHERE type = 'purchase' AND stripe_payment_intent_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS "credit_hold" (
    id text PRIMARY KEY,
    generation_id text NOT NULL UNIQUE,
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    api_key_id text REFERENCES "api_key"(id) ON DELETE SET NULL,
    workspace_id text REFERENCES "workspace"(id) ON DELETE SET NULL,
    reserved_micros bigint NOT NULL,
    actual_micros bigint,
    budget_held boolean NOT NULL DEFAULT false,
    key_limit_held boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'open',
    created_at timestamp NOT NULL DEFAULT now(),
    closed_at timestamp
  )`,
  `CREATE INDEX IF NOT EXISTS credit_hold_user_idx ON "credit_hold"(user_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS credit_hold_open_idx ON "credit_hold"(status, created_at)`,
  `ALTER TABLE "credit_hold" ADD COLUMN IF NOT EXISTS budget_held boolean NOT NULL DEFAULT false`,
  `ALTER TABLE "credit_hold" ADD COLUMN IF NOT EXISTS key_limit_held boolean NOT NULL DEFAULT false`,
  `CREATE TABLE IF NOT EXISTS "subscription" (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    customer_id text NOT NULL,
    plan text NOT NULL,
    status text NOT NULL,
    price_id text,
    quantity integer NOT NULL DEFAULT 1,
    current_period_start timestamp,
    current_period_end timestamp,
    cancel_at_period_end boolean NOT NULL DEFAULT false,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS subscription_user_idx ON "subscription"(user_id)`,
  `CREATE INDEX IF NOT EXISTS subscription_customer_idx ON "subscription"(customer_id)`,
  `CREATE TABLE IF NOT EXISTS "stripe_webhook_event" (
    id text PRIMARY KEY,
    event_type text NOT NULL,
    status text NOT NULL DEFAULT 'processing',
    attempts integer NOT NULL DEFAULT 1,
    stripe_created_at timestamp NOT NULL,
    received_at timestamp NOT NULL DEFAULT now(),
    last_attempt_at timestamp NOT NULL DEFAULT now(),
    processed_at timestamp,
    last_error text
  )`,
  `CREATE INDEX IF NOT EXISTS stripe_webhook_event_status_idx ON "stripe_webhook_event"(status, last_attempt_at)`,
  `CREATE INDEX IF NOT EXISTS stripe_webhook_event_received_idx ON "stripe_webhook_event"(received_at)`,
  `CREATE TABLE IF NOT EXISTS "generation" (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    api_key_id text REFERENCES "api_key"(id) ON DELETE SET NULL,
    workspace_id text,
    requested_model text NOT NULL,
    routed_model text NOT NULL,
    provider text NOT NULL,
    finish_reason text,
    prompt_tokens integer NOT NULL DEFAULT 0,
    completion_tokens integer NOT NULL DEFAULT 0,
    reasoning_tokens integer NOT NULL DEFAULT 0,
    cost_micros bigint NOT NULL DEFAULT 0,
    latency_ms integer,
    streamed boolean NOT NULL DEFAULT false,
    is_byok boolean NOT NULL DEFAULT false,
    app_referer text,
    app_title text,
    prompt text,
    completion text,
    error text,
    metadata jsonb,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS generation_user_idx ON "generation"(user_id)`,
  `CREATE INDEX IF NOT EXISTS generation_created_idx ON "generation"(created_at)`,
  `CREATE TABLE IF NOT EXISTS "byok_credential" (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    workspace_id text REFERENCES "workspace"(id) ON DELETE CASCADE,
    provider text NOT NULL,
    encrypted_key text NOT NULL,
    label text,
    deleted boolean NOT NULL DEFAULT false,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "guardrail" (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    workspace_id text,
    name text NOT NULL,
    allowed_models jsonb,
    blocked_models jsonb,
    allowed_providers jsonb,
    max_cost_micros bigint,
    prompt_injection boolean NOT NULL DEFAULT false,
    sensitive_info boolean NOT NULL DEFAULT false,
    enforce_zdr boolean NOT NULL DEFAULT false,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `UPDATE "byok_credential" AS credential
   SET deleted = true, encrypted_key = '', workspace_id = NULL
   WHERE credential.workspace_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM "workspace" WHERE "workspace".id = credential.workspace_id)`,
  `WITH ranked AS (
     SELECT id, row_number() OVER (
       PARTITION BY user_id, provider
       ORDER BY created_at DESC, id DESC
     ) AS position
     FROM "byok_credential"
     WHERE deleted = false AND workspace_id IS NULL
   )
   UPDATE "byok_credential" AS credential
   SET deleted = true, encrypted_key = ''
   FROM ranked
   WHERE credential.id = ranked.id AND ranked.position > 1`,
  `WITH ranked AS (
     SELECT id, row_number() OVER (
       PARTITION BY workspace_id, provider
       ORDER BY created_at DESC, id DESC
     ) AS position
     FROM "byok_credential"
     WHERE deleted = false AND workspace_id IS NOT NULL
   )
   UPDATE "byok_credential" AS credential
   SET deleted = true, encrypted_key = ''
   FROM ranked
   WHERE credential.id = ranked.id AND ranked.position > 1`,
  `DO $$ BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'byok_credential_workspace_id_workspace_id_fk'
     ) THEN
       ALTER TABLE "byok_credential"
       ADD CONSTRAINT "byok_credential_workspace_id_workspace_id_fk"
       FOREIGN KEY (workspace_id) REFERENCES "workspace"(id) ON DELETE CASCADE;
     END IF;
   END $$`,
  `CREATE UNIQUE INDEX IF NOT EXISTS byok_account_provider_active_uidx
   ON "byok_credential"(user_id, provider)
   WHERE workspace_id IS NULL AND deleted = false`,
  `CREATE UNIQUE INDEX IF NOT EXISTS byok_workspace_provider_active_uidx
   ON "byok_credential"(workspace_id, provider)
   WHERE workspace_id IS NOT NULL AND deleted = false`,
  `ALTER TABLE "guardrail" ADD COLUMN IF NOT EXISTS allowed_providers jsonb`,
  `ALTER TABLE "guardrail" ADD COLUMN IF NOT EXISTS enforce_zdr boolean NOT NULL DEFAULT false`,
  `CREATE TABLE IF NOT EXISTS "file" (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    workspace_id text,
    filename text NOT NULL,
    mime text NOT NULL,
    size integer NOT NULL,
    content text,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "hub_namespace" (
    id text PRIMARY KEY,
    slug text NOT NULL,
    display_name text NOT NULL,
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    workspace_id text REFERENCES "workspace"(id) ON DELETE CASCADE,
    verified boolean NOT NULL DEFAULT false,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS hub_namespace_slug_uidx ON "hub_namespace"(slug)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS hub_namespace_personal_owner_uidx
   ON "hub_namespace"(user_id) WHERE workspace_id IS NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS hub_namespace_workspace_uidx
   ON "hub_namespace"(workspace_id) WHERE workspace_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS "hub_repository" (
    id text PRIMARY KEY,
    namespace_id text NOT NULL REFERENCES "hub_namespace"(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    workspace_id text REFERENCES "workspace"(id) ON DELETE CASCADE,
    slug text NOT NULL,
    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    visibility text NOT NULL DEFAULT 'public',
    gated boolean NOT NULL DEFAULT false,
    license text NOT NULL DEFAULT 'other',
    task text,
    tags jsonb NOT NULL DEFAULT '[]'::jsonb,
    latest_revision integer NOT NULL DEFAULT 0,
    downloads integer NOT NULL DEFAULT 0,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    CONSTRAINT hub_repository_visibility_check CHECK (visibility IN ('public', 'private')),
    CONSTRAINT hub_repository_revision_check CHECK (latest_revision >= 0),
    CONSTRAINT hub_repository_downloads_check CHECK (downloads >= 0)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS hub_repository_namespace_slug_uidx
   ON "hub_repository"(namespace_id, slug)`,
  `CREATE INDEX IF NOT EXISTS hub_repository_public_updated_idx
   ON "hub_repository"(updated_at) WHERE visibility = 'public'`,
  `CREATE INDEX IF NOT EXISTS hub_repository_user_idx ON "hub_repository"(user_id, updated_at)`,
  `CREATE INDEX IF NOT EXISTS hub_repository_workspace_idx ON "hub_repository"(workspace_id, updated_at)`,
  `CREATE TABLE IF NOT EXISTS "hub_revision" (
    id text PRIMARY KEY,
    repository_id text NOT NULL REFERENCES "hub_repository"(id) ON DELETE CASCADE,
    revision integer NOT NULL,
    commit_sha text NOT NULL,
    commit_message text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
    created_at timestamp NOT NULL DEFAULT now(),
    CONSTRAINT hub_revision_number_check CHECK (revision > 0)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS hub_revision_repository_number_uidx
   ON "hub_revision"(repository_id, revision)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS hub_revision_repository_sha_uidx
   ON "hub_revision"(repository_id, commit_sha)`,
  `CREATE INDEX IF NOT EXISTS hub_revision_repository_created_idx
   ON "hub_revision"(repository_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS "hub_revision_file" (
    id text PRIMARY KEY,
    revision_id text NOT NULL REFERENCES "hub_revision"(id) ON DELETE CASCADE,
    file_id text NOT NULL REFERENCES "file"(id) ON DELETE RESTRICT,
    path text NOT NULL,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS hub_revision_file_path_uidx
   ON "hub_revision_file"(revision_id, path)`,
  `CREATE INDEX IF NOT EXISTS hub_revision_file_file_idx ON "hub_revision_file"(file_id)`,
  `CREATE TABLE IF NOT EXISTS "hub_access_grant" (
    id text PRIMARY KEY,
    repository_id text NOT NULL REFERENCES "hub_repository"(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending',
    requested_at timestamp NOT NULL DEFAULT now(),
    decided_at timestamp,
    decided_by text REFERENCES "user"(id) ON DELETE SET NULL,
    CONSTRAINT hub_access_grant_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS hub_access_grant_repository_user_uidx
   ON "hub_access_grant"(repository_id, user_id)`,
  `CREATE INDEX IF NOT EXISTS hub_access_grant_repository_status_idx
   ON "hub_access_grant"(repository_id, status)`,
  `CREATE TABLE IF NOT EXISTS "hub_space" (
    id text PRIMARY KEY,
    namespace_id text NOT NULL REFERENCES "hub_namespace"(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    workspace_id text REFERENCES workspace(id) ON DELETE CASCADE,
    slug text NOT NULL,
    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    visibility text NOT NULL DEFAULT 'public',
    model text NOT NULL,
    system_prompt text NOT NULL DEFAULT '',
    starter_prompt text,
    temperature_milli integer NOT NULL DEFAULT 700,
    max_tokens integer NOT NULL DEFAULT 1024,
    runs integer NOT NULL DEFAULT 0,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    CONSTRAINT hub_space_visibility_check CHECK (visibility IN ('public', 'private')),
    CONSTRAINT hub_space_temperature_check CHECK (temperature_milli BETWEEN 0 AND 2000),
    CONSTRAINT hub_space_max_tokens_check CHECK (max_tokens BETWEEN 1 AND 131072),
    CONSTRAINT hub_space_runs_check CHECK (runs >= 0)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS hub_space_namespace_slug_uidx
   ON "hub_space"(namespace_id, slug)`,
  `CREATE INDEX IF NOT EXISTS hub_space_public_updated_idx
   ON "hub_space"(updated_at) WHERE visibility = 'public'`,
  `CREATE INDEX IF NOT EXISTS hub_space_user_idx ON "hub_space"(user_id, updated_at)`,
  `CREATE INDEX IF NOT EXISTS hub_space_workspace_idx ON "hub_space"(workspace_id, updated_at)`,
  `CREATE TABLE IF NOT EXISTS "hub_space_run" (
    id text PRIMARY KEY,
    space_id text NOT NULL REFERENCES "hub_space"(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    workspace_id text REFERENCES workspace(id) ON DELETE SET NULL,
    generation_id text REFERENCES "generation"(id) ON DELETE SET NULL,
    model text NOT NULL,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS hub_space_run_generation_uidx
   ON "hub_space_run"(generation_id) WHERE generation_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS hub_space_run_space_created_idx
   ON "hub_space_run"(space_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS hub_space_run_user_created_idx
   ON "hub_space_run"(user_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS "preset" (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    slug text NOT NULL,
    version integer NOT NULL DEFAULT 1,
    config jsonb NOT NULL,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "oauth_code" (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    workspace_id text REFERENCES workspace(id) ON DELETE SET NULL,
    scopes jsonb NOT NULL DEFAULT '["inference:write"]'::jsonb,
    code_hash text NOT NULL UNIQUE,
    code_challenge text NOT NULL,
    expires_at timestamp NOT NULL,
    used boolean NOT NULL DEFAULT false
  )`,
  `ALTER TABLE "oauth_code" ADD COLUMN IF NOT EXISTS workspace_id text REFERENCES workspace(id) ON DELETE SET NULL`,
  `ALTER TABLE "oauth_code" ADD COLUMN IF NOT EXISTS scopes jsonb NOT NULL DEFAULT '["inference:write"]'::jsonb`,
  `CREATE UNIQUE INDEX IF NOT EXISTS oauth_code_code_hash_unique ON "oauth_code" (code_hash)`,
  `CREATE TABLE IF NOT EXISTS "provider_health" (
    id text PRIMARY KEY,
    provider text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'unknown',
    latency_ms integer,
    last_check timestamp NOT NULL DEFAULT now(),
    detail text
  )`,
  `CREATE TABLE IF NOT EXISTS "catalog_snapshot" (
    id text PRIMARY KEY,
    source text NOT NULL,
    model_count integer NOT NULL,
    fetched_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "video_job" (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    workspace_id text REFERENCES workspace(id) ON DELETE SET NULL,
    model text NOT NULL,
    prompt text,
    status text NOT NULL DEFAULT 'queued',
    result_url text,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE "video_job" ADD COLUMN IF NOT EXISTS workspace_id text REFERENCES workspace(id) ON DELETE SET NULL`,
  `CREATE TABLE IF NOT EXISTS "observability_destination" (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    workspace_id text,
    type text NOT NULL,
    name text NOT NULL,
    config jsonb NOT NULL,
    deleted boolean NOT NULL DEFAULT false,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE "video_job" ALTER COLUMN "prompt" DROP NOT NULL`,
  `CREATE TABLE IF NOT EXISTS "webhook_delivery" (
    id text PRIMARY KEY,
    destination_id text NOT NULL REFERENCES "observability_destination"(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    event text NOT NULL,
    payload jsonb NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    attempts integer NOT NULL DEFAULT 0,
    next_attempt_at timestamp NOT NULL DEFAULT now(),
    last_attempt_at timestamp,
    response_status integer,
    last_error text,
    delivered_at timestamp,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS webhook_delivery_due_idx ON "webhook_delivery"(status, next_attempt_at)`,
  `CREATE INDEX IF NOT EXISTS webhook_delivery_user_idx ON "webhook_delivery"(user_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS "chat_share" (
    id text PRIMARY KEY,
    user_id text REFERENCES "user"(id) ON DELETE SET NULL,
    workspace_id text REFERENCES workspace(id) ON DELETE SET NULL,
    title text,
    payload jsonb NOT NULL,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE "chat_share" ADD COLUMN IF NOT EXISTS workspace_id text REFERENCES workspace(id) ON DELETE SET NULL`,
  `DROP INDEX IF EXISTS ledger_generation_uidx`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ledger_generation_type_uidx ON "credit_ledger"(generation_id, type)`,
  `CREATE TABLE IF NOT EXISTS "schema_migrations" (
    id text PRIMARY KEY,
    applied_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "audit_log" (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    workspace_id text,
    action text NOT NULL,
    resource text,
    resource_id text,
    ip text,
    meta jsonb,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS audit_log_user_idx ON "audit_log"(user_id, created_at)`,
  `ALTER TABLE "preset" ADD COLUMN IF NOT EXISTS workspace_id text`,
];
