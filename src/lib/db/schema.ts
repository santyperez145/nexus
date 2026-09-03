import {
  bigint,
  boolean,
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
  stripeCustomerId: text("stripe_customer_id"),
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
    disabled: boolean("disabled").notNull().default(false),
    limitMicros: bigint("limit_micros", { mode: "number" }),
    usageMicros: bigint("usage_micros", { mode: "number" }).notNull().default(0),
    limitReset: text("limit_reset"),
    includeByokInLimit: boolean("include_byok_in_limit").notNull().default(false),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("api_key_user_idx").on(t.userId)],
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
    generationId: text("generation_id"),
    note: text("note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("ledger_user_idx").on(t.userId),
    uniqueIndex("ledger_stripe_session_uidx").on(t.stripeSessionId),
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

export const byokCredentials = pgTable("byok_credential", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id"),
  provider: text("provider").notNull(),
  encryptedKey: text("encrypted_key").notNull(),
  label: text("label"),
  deleted: boolean("deleted").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const guardrails = pgTable("guardrail", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id"),
  name: text("name").notNull(),
  allowedModels: jsonb("allowed_models").$type<string[] | null>(),
  blockedModels: jsonb("blocked_models").$type<string[] | null>(),
  maxCostMicros: bigint("max_cost_micros", { mode: "number" }),
  promptInjection: boolean("prompt_injection").notNull().default(false),
  sensitiveInfo: boolean("sensitive_info").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const files = pgTable("file", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id"),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  content: text("content"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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
});

export const oauthCodes = pgTable("oauth_code", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
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
  model: text("model").notNull(),
  prompt: text("prompt").notNull(),
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
