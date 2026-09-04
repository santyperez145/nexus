import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  creditMicros: bigint("credit_micros", { mode: "number" }).notNull().default(0),
  defaultModel: text("default_model").default("nexus/auto"),
  allowTraining: boolean("allow_training").notNull().default(true),
  zdr: boolean("zdr").notNull().default(false),
  logPrompts: boolean("log_prompts").notNull().default(false),
  autoTopupEnabled: boolean("auto_topup_enabled").notNull().default(false),
  autoTopupThresholdUsd: numeric("auto_topup_threshold_usd"),
  autoTopupAmountUsd: numeric("auto_topup_amount_usd"),
  stripeCustomerId: text("stripe_customer_id").unique(),
  plan: text("plan").notNull().default("free"),
  subscriptionStatus: text("subscription_status").notNull().default("inactive"),
  notifyLowBalance: boolean("notify_low_balance").notNull().default(true),
  notifyKeyLimit: boolean("notify_key_limit").notNull().default(true),
  notifyOrgInvite: boolean("notify_org_invite").notNull().default(true),
  lowBalanceThresholdUsd: numeric("low_balance_threshold_usd").default("5"),
});

export const sessions = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const accounts = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    issuer: text("issuer").notNull().default(""),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verifications = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const organizations = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const organizationMembers = pgTable(
  "organization_member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("org_member_unique").on(t.organizationId, t.userId)],
);

export const organizationInvites = pgTable(
  "organization_invite",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("member"),
    token: text("token").notNull().unique(),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    acceptedAt: timestamp("accepted_at"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("org_invite_email_unique").on(t.organizationId, t.email)],
);

export const workspaces = pgTable(
  "workspace",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    includeByokInBudgets: boolean("include_byok_in_budgets").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("workspace_slug_user").on(t.userId, t.slug)],
);

export const workspaceMembers = pgTable(
  "workspace_member",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("workspace_member_unique").on(t.workspaceId, t.userId),
    index("workspace_member_user_idx").on(t.userId),
  ],
);

export const workspaceBudgets = pgTable(
  "workspace_budget",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    interval: text("interval").notNull(),
    limitMicros: bigint("limit_micros", { mode: "number" }).notNull(),
    spentMicros: bigint("spent_micros", { mode: "number" }).notNull().default(0),
  },
  (t) => [uniqueIndex("workspace_budget_interval").on(t.workspaceId, t.interval)],
);

export const apiKeys = pgTable(
  "api_key",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    keyPrefix: text("key_prefix").notNull(),
    isManagement: boolean("is_management").notNull().default(false),
    scopes: jsonb("scopes").$type<string[] | null>(),
    disabled: boolean("disabled").notNull().default(false),
    pendingReveal: boolean("pending_reveal").notNull().default(false),
    limitMicros: bigint("limit_micros", { mode: "number" }),
    usageMicros: bigint("usage_micros", { mode: "number" }).notNull().default(0),
    limitReset: text("limit_reset"),
    includeByokInLimit: boolean("include_byok_in_limit").notNull().default(false),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("api_key_user_idx").on(t.userId),
    uniqueIndex("api_key_pending_reveal_user_uidx")
      .on(t.userId)
      .where(sql`${t.pendingReveal} = true`),
  ],
);

export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    micros: bigint("micros", { mode: "number" }).notNull(),
    stripeSessionId: text("stripe_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeAmountMinor: integer("stripe_amount_minor"),
    stripeCurrency: text("stripe_currency"),
    generationId: text("generation_id"),
    note: text("note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("ledger_user_idx").on(t.userId),
    index("ledger_stripe_payment_intent_idx").on(t.stripePaymentIntentId),
    uniqueIndex("ledger_stripe_session_uidx").on(t.stripeSessionId),
    uniqueIndex("ledger_purchase_payment_intent_uidx")
      .on(t.stripePaymentIntentId)
      .where(sql`${t.type} = 'purchase' AND ${t.stripePaymentIntentId} IS NOT NULL`),
    uniqueIndex("ledger_generation_type_uidx").on(t.generationId, t.type),
  ],
);

export const creditHolds = pgTable(
  "credit_hold",
  {
    id: text("id").primaryKey(),
    generationId: text("generation_id").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    apiKeyId: text("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    reservedMicros: bigint("reserved_micros", { mode: "number" }).notNull(),
    actualMicros: bigint("actual_micros", { mode: "number" }),
    budgetHeld: boolean("budget_held").notNull().default(false),
    keyLimitHeld: boolean("key_limit_held").notNull().default(false),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    closedAt: timestamp("closed_at"),
  },
  (t) => [
    index("credit_hold_user_idx").on(t.userId, t.createdAt),
    index("credit_hold_open_idx").on(t.status, t.createdAt),
  ],
);

export const subscriptions = pgTable(
  "subscription",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    customerId: text("customer_id").notNull(),
    plan: text("plan").notNull(),
    status: text("status").notNull(),
    priceId: text("price_id"),
    quantity: integer("quantity").notNull().default(1),
    currentPeriodStart: timestamp("current_period_start"),
    currentPeriodEnd: timestamp("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("subscription_user_idx").on(t.userId), index("subscription_customer_idx").on(t.customerId)],
);

export const stripeWebhookEvents = pgTable(
  "stripe_webhook_event",
  {
    id: text("id").primaryKey(),
    eventType: text("event_type").notNull(),
    status: text("status").notNull().default("processing"),
    attempts: integer("attempts").notNull().default(1),
    stripeCreatedAt: timestamp("stripe_created_at").notNull(),
    receivedAt: timestamp("received_at").notNull().defaultNow(),
    lastAttemptAt: timestamp("last_attempt_at").notNull().defaultNow(),
    processedAt: timestamp("processed_at"),
    lastError: text("last_error"),
  },
  (t) => [
    index("stripe_webhook_event_status_idx").on(t.status, t.lastAttemptAt),
    index("stripe_webhook_event_received_idx").on(t.receivedAt),
  ],
);

export const generations = pgTable(
  "generation",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    apiKeyId: text("api_key_id").references(() => apiKeys.id, {
      onDelete: "set null",
    }),
    workspaceId: text("workspace_id"),
    requestedModel: text("requested_model").notNull(),
    routedModel: text("routed_model").notNull(),
    provider: text("provider").notNull(),
    finishReason: text("finish_reason"),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    reasoningTokens: integer("reasoning_tokens").notNull().default(0),
    costMicros: bigint("cost_micros", { mode: "number" }).notNull().default(0),
    latencyMs: integer("latency_ms"),
    streamed: boolean("streamed").notNull().default(false),
    isByok: boolean("is_byok").notNull().default(false),
    appReferer: text("app_referer"),
    appTitle: text("app_title"),
    prompt: text("prompt"),
    completion: text("completion"),
    error: text("error"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("generation_user_idx").on(t.userId),
    index("generation_created_idx").on(t.createdAt),
  ],
);

export const byokCredentials = pgTable(
  "byok_credential",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    provider: text("provider").notNull(),
    encryptedKey: text("encrypted_key").notNull(),
    label: text("label"),
    deleted: boolean("deleted").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("byok_account_provider_active_uidx")
      .on(t.userId, t.provider)
      .where(sql`${t.workspaceId} IS NULL AND ${t.deleted} = false`),
    uniqueIndex("byok_workspace_provider_active_uidx")
      .on(t.workspaceId, t.provider)
      .where(sql`${t.workspaceId} IS NOT NULL AND ${t.deleted} = false`),
  ],
);

export const guardrails = pgTable("guardrail", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id"),
  name: text("name").notNull(),
  allowedModels: jsonb("allowed_models").$type<string[] | null>(),
  blockedModels: jsonb("blocked_models").$type<string[] | null>(),
  allowedProviders: jsonb("allowed_providers").$type<string[] | null>(),
  maxCostMicros: bigint("max_cost_micros", { mode: "number" }),
  promptInjection: boolean("prompt_injection").notNull().default(false),
  sensitiveInfo: boolean("sensitive_info").notNull().default(false),
  enforceZdr: boolean("enforce_zdr").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const files = pgTable(
  "file",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id"),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    content: text("content"),
    storageBackend: text("storage_backend").notNull().default("database"),
    storageKey: text("storage_key"),
    checksumSha256: text("checksum_sha256"),
    etag: text("etag"),
    status: text("status").notNull().default("ready"),
    uploadExpiresAt: timestamp("upload_expires_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("file_storage_key_uidx")
      .on(t.storageKey)
      .where(sql`${t.storageKey} IS NOT NULL`),
    index("file_user_status_created_idx").on(t.userId, t.status, t.createdAt),
    index("file_workspace_status_created_idx").on(t.workspaceId, t.status, t.createdAt),
    check("file_size_check", sql`${t.size} >= 0`),
    check("file_storage_backend_check", sql`${t.storageBackend} IN ('database', 's3')`),
    check("file_status_check", sql`${t.status} IN ('pending', 'ready', 'failed')`),
    check(
      "file_storage_shape_check",
      sql`(${t.storageBackend} = 'database' AND ${t.storageKey} IS NULL) OR (${t.storageBackend} = 's3' AND ${t.storageKey} IS NOT NULL)`,
    ),
  ],
);

export const hubNamespaces = pgTable(
  "hub_namespace",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    displayName: text("display_name").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    verified: boolean("verified").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("hub_namespace_slug_uidx").on(t.slug),
    uniqueIndex("hub_namespace_personal_owner_uidx")
      .on(t.userId)
      .where(sql`${t.workspaceId} IS NULL`),
    uniqueIndex("hub_namespace_workspace_uidx")
      .on(t.workspaceId)
      .where(sql`${t.workspaceId} IS NOT NULL`),
  ],
);

export const hubRepositories = pgTable(
  "hub_repository",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull().default("dataset"),
    namespaceId: text("namespace_id")
      .notNull()
      .references(() => hubNamespaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    modelCard: text("model_card"),
    visibility: text("visibility").notNull().default("public"),
    gated: boolean("gated").notNull().default(false),
    license: text("license").notNull().default("other"),
    task: text("task"),
    libraryName: text("library_name"),
    baseModel: text("base_model"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    latestRevision: integer("latest_revision").notNull().default(0),
    downloads: integer("downloads").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("hub_repository_kind_namespace_slug_uidx").on(t.kind, t.namespaceId, t.slug),
    index("hub_repository_public_updated_idx")
      .on(t.updatedAt)
      .where(sql`${t.visibility} = 'public'`),
    index("hub_repository_user_idx").on(t.userId, t.updatedAt),
    index("hub_repository_workspace_idx").on(t.workspaceId, t.updatedAt),
    check("hub_repository_visibility_check", sql`${t.visibility} IN ('public', 'private')`),
    check("hub_repository_kind_check", sql`${t.kind} IN ('dataset', 'model')`),
    check("hub_repository_revision_check", sql`${t.latestRevision} >= 0`),
    check("hub_repository_downloads_check", sql`${t.downloads} >= 0`),
  ],
);

export const hubRevisions = pgTable(
  "hub_revision",
  {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => hubRepositories.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    commitSha: text("commit_sha").notNull(),
    commitMessage: text("commit_message").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("hub_revision_repository_number_uidx").on(t.repositoryId, t.revision),
    uniqueIndex("hub_revision_repository_sha_uidx").on(t.repositoryId, t.commitSha),
    index("hub_revision_repository_created_idx").on(t.repositoryId, t.createdAt),
    check("hub_revision_number_check", sql`${t.revision} > 0`),
  ],
);

export const hubRevisionFiles = pgTable(
  "hub_revision_file",
  {
    id: text("id").primaryKey(),
    revisionId: text("revision_id")
      .notNull()
      .references(() => hubRevisions.id, { onDelete: "cascade" }),
    fileId: text("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "restrict" }),
    path: text("path").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("hub_revision_file_path_uidx").on(t.revisionId, t.path),
    index("hub_revision_file_file_idx").on(t.fileId),
  ],
);

export const hubAccessGrants = pgTable(
  "hub_access_grant",
  {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => hubRepositories.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    requestedAt: timestamp("requested_at").notNull().defaultNow(),
    decidedAt: timestamp("decided_at"),
    decidedBy: text("decided_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("hub_access_grant_repository_user_uidx").on(t.repositoryId, t.userId),
    index("hub_access_grant_repository_status_idx").on(t.repositoryId, t.status),
    check("hub_access_grant_status_check", sql`${t.status} IN ('pending', 'approved', 'rejected')`),
  ],
);

export const hubSpaces = pgTable(
  "hub_space",
  {
    id: text("id").primaryKey(),
    namespaceId: text("namespace_id")
      .notNull()
      .references(() => hubNamespaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    visibility: text("visibility").notNull().default("public"),
    model: text("model").notNull(),
    systemPrompt: text("system_prompt").notNull().default(""),
    starterPrompt: text("starter_prompt"),
    temperatureMilli: integer("temperature_milli").notNull().default(700),
    maxTokens: integer("max_tokens").notNull().default(1024),
    runs: integer("runs").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("hub_space_namespace_slug_uidx").on(t.namespaceId, t.slug),
    index("hub_space_public_updated_idx")
      .on(t.updatedAt)
      .where(sql`${t.visibility} = 'public'`),
    index("hub_space_user_idx").on(t.userId, t.updatedAt),
    index("hub_space_workspace_idx").on(t.workspaceId, t.updatedAt),
    check("hub_space_visibility_check", sql`${t.visibility} IN ('public', 'private')`),
    check("hub_space_temperature_check", sql`${t.temperatureMilli} BETWEEN 0 AND 2000`),
    check("hub_space_max_tokens_check", sql`${t.maxTokens} BETWEEN 1 AND 131072`),
    check("hub_space_runs_check", sql`${t.runs} >= 0`),
  ],
);

export const hubSpaceRuns = pgTable(
  "hub_space_run",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id")
      .notNull()
      .references(() => hubSpaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    generationId: text("generation_id").references(() => generations.id, {
      onDelete: "set null",
    }),
    model: text("model").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("hub_space_run_generation_uidx")
      .on(t.generationId)
      .where(sql`${t.generationId} IS NOT NULL`),
    index("hub_space_run_space_created_idx").on(t.spaceId, t.createdAt),
    index("hub_space_run_user_created_idx").on(t.userId, t.createdAt),
  ],
);

export const presets = pgTable("preset", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  version: integer("version").notNull().default(1),
  config: jsonb("config").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  workspaceId: text("workspace_id"),
});

export const oauthCodes = pgTable("oauth_code", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
  scopes: jsonb("scopes").$type<string[]>().notNull().default(["inference:write"]),
  codeHash: text("code_hash").notNull().unique(),
  codeChallenge: text("code_challenge").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
});

export const providerHealth = pgTable("provider_health", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull().unique(),
  status: text("status").notNull().default("unknown"),
  latencyMs: integer("latency_ms"),
  lastCheck: timestamp("last_check").notNull().defaultNow(),
  detail: text("detail"),
});

export const catalogSnapshots = pgTable("catalog_snapshot", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  modelCount: integer("model_count").notNull(),
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
});

export const videoJobs = pgTable("video_job", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
  model: text("model").notNull(),
  prompt: text("prompt"),
  status: text("status").notNull().default("queued"),
  resultUrl: text("result_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const observabilityDestinations = pgTable("observability_destination", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id"),
  type: text("type").notNull(),
  name: text("name").notNull(),
  config: jsonb("config").$type<Record<string, unknown>>().notNull(),
  deleted: boolean("deleted").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const webhookDeliveries = pgTable(
  "webhook_delivery",
  {
    id: text("id").primaryKey(),
    destinationId: text("destination_id")
      .notNull()
      .references(() => observabilityDestinations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at").notNull().defaultNow(),
    lastAttemptAt: timestamp("last_attempt_at"),
    responseStatus: integer("response_status"),
    lastError: text("last_error"),
    deliveredAt: timestamp("delivered_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("webhook_delivery_due_idx").on(t.status, t.nextAttemptAt),
    index("webhook_delivery_user_idx").on(t.userId, t.createdAt),
  ],
);

export const chatShares = pgTable("chat_share", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
  title: text("title"),
  payload: jsonb("payload")
    .$type<{
      model: string;
      messages: Array<{ role: string; content: string }>;
      stats?: Record<string, unknown> | null;
      comparing?: boolean;
    }>()
    .notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const auditLogs = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    workspaceId: text("workspace_id"),
    action: text("action").notNull(),
    resource: text("resource"),
    resourceId: text("resource_id"),
    ip: text("ip"),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_log_user_idx").on(t.userId, t.createdAt)],
);

export const schemaMigrations = pgTable("schema_migrations", {
  id: text("id").primaryKey(),
  appliedAt: timestamp("applied_at").notNull().defaultNow(),
});
