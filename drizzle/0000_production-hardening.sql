CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"issuer" text DEFAULT '' NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_key" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"is_management" boolean DEFAULT false NOT NULL,
	"scopes" jsonb,
	"disabled" boolean DEFAULT false NOT NULL,
	"limit_micros" bigint,
	"usage_micros" bigint DEFAULT 0 NOT NULL,
	"limit_reset" text,
	"include_byok_in_limit" boolean DEFAULT false NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_key_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"action" text NOT NULL,
	"resource" text,
	"resource_id" text,
	"ip" text,
	"meta" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "byok_credential" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"provider" text NOT NULL,
	"encrypted_key" text NOT NULL,
	"label" text,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"model_count" integer NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_share" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"title" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_hold" (
	"id" text PRIMARY KEY NOT NULL,
	"generation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"api_key_id" text,
	"workspace_id" text,
	"reserved_micros" bigint NOT NULL,
	"actual_micros" bigint,
	"budget_held" boolean DEFAULT false NOT NULL,
	"key_limit_held" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp,
	CONSTRAINT "credit_hold_generation_id_unique" UNIQUE("generation_id")
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"micros" bigint NOT NULL,
	"stripe_session_id" text,
	"generation_id" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"content" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"api_key_id" text,
	"workspace_id" text,
	"requested_model" text NOT NULL,
	"routed_model" text NOT NULL,
	"provider" text NOT NULL,
	"finish_reason" text,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"reasoning_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"streamed" boolean DEFAULT false NOT NULL,
	"is_byok" boolean DEFAULT false NOT NULL,
	"app_referer" text,
	"app_title" text,
	"prompt" text,
	"completion" text,
	"error" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guardrail" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"name" text NOT NULL,
	"allowed_models" jsonb,
	"blocked_models" jsonb,
	"max_cost_micros" bigint,
	"prompt_injection" boolean DEFAULT false NOT NULL,
	"sensitive_info" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_code" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"scopes" jsonb DEFAULT '["inference:write"]'::jsonb NOT NULL,
	"code_hash" text NOT NULL,
	"code_challenge" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	CONSTRAINT "oauth_code_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "observability_destination" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"config" jsonb NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_invite" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"token" text NOT NULL,
	"invited_by" text NOT NULL,
	"accepted_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_invite_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "organization_member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "preset" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"slug" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"workspace_id" text
);
--> statement-breakpoint
CREATE TABLE "provider_health" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"latency_ms" integer,
	"last_check" timestamp DEFAULT now() NOT NULL,
	"detail" text,
	CONSTRAINT "provider_health_provider_unique" UNIQUE("provider")
);
--> statement-breakpoint
CREATE TABLE "schema_migrations" (
	"id" text PRIMARY KEY NOT NULL,
	"applied_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"plan" text NOT NULL,
	"status" text NOT NULL,
	"price_id" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"credit_micros" bigint DEFAULT 0 NOT NULL,
	"default_model" text DEFAULT 'nexus/auto',
	"allow_training" boolean DEFAULT true NOT NULL,
	"zdr" boolean DEFAULT false NOT NULL,
	"log_prompts" boolean DEFAULT false NOT NULL,
	"auto_topup_enabled" boolean DEFAULT false NOT NULL,
	"auto_topup_threshold_usd" numeric,
	"auto_topup_amount_usd" numeric,
	"stripe_customer_id" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"subscription_status" text DEFAULT 'inactive' NOT NULL,
	"notify_low_balance" boolean DEFAULT true NOT NULL,
	"notify_key_limit" boolean DEFAULT true NOT NULL,
	"notify_org_invite" boolean DEFAULT true NOT NULL,
	"low_balance_threshold_usd" numeric DEFAULT '5',
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "video_job" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"model" text NOT NULL,
	"prompt" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"result_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_budget" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"interval" text NOT NULL,
	"limit_micros" bigint NOT NULL,
	"spent_micros" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"include_byok_in_budgets" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "byok_credential" ADD CONSTRAINT "byok_credential_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_share" ADD CONSTRAINT "chat_share_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_hold" ADD CONSTRAINT "credit_hold_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_hold" ADD CONSTRAINT "credit_hold_api_key_id_api_key_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_key"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_hold" ADD CONSTRAINT "credit_hold_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation" ADD CONSTRAINT "generation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation" ADD CONSTRAINT "generation_api_key_id_api_key_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_key"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardrail" ADD CONSTRAINT "guardrail_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_code" ADD CONSTRAINT "oauth_code_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_code" ADD CONSTRAINT "oauth_code_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observability_destination" ADD CONSTRAINT "observability_destination_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invite" ADD CONSTRAINT "organization_invite_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invite" ADD CONSTRAINT "organization_invite_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_member" ADD CONSTRAINT "organization_member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_member" ADD CONSTRAINT "organization_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preset" ADD CONSTRAINT "preset_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_job" ADD CONSTRAINT "video_job_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_budget" ADD CONSTRAINT "workspace_budget_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "api_key_user_idx" ON "api_key" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_log_user_idx" ON "audit_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "credit_hold_user_idx" ON "credit_hold" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "credit_hold_open_idx" ON "credit_hold" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "ledger_user_idx" ON "credit_ledger" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_stripe_session_uidx" ON "credit_ledger" USING btree ("stripe_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_generation_type_uidx" ON "credit_ledger" USING btree ("generation_id","type");--> statement-breakpoint
CREATE INDEX "generation_user_idx" ON "generation" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "generation_created_idx" ON "generation" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "org_invite_email_unique" ON "organization_invite" USING btree ("organization_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "org_member_unique" ON "organization_member" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscription_user_idx" ON "subscription" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscription_customer_idx" ON "subscription" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_budget_interval" ON "workspace_budget" USING btree ("workspace_id","interval");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_slug_user" ON "workspace" USING btree ("user_id","slug");