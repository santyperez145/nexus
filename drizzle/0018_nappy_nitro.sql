CREATE TABLE "provider_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"protocol" text NOT NULL,
	"auth_scheme" text DEFAULT 'bearer' NOT NULL,
	"base_url" text NOT NULL,
	"models_path" text DEFAULT '/models' NOT NULL,
	"encrypted_key" text NOT NULL,
	"secret_hint" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"zdr_capable" boolean DEFAULT false NOT NULL,
	"zdr_verified" boolean DEFAULT false NOT NULL,
	"no_training_verified" boolean DEFAULT false NOT NULL,
	"privacy_policy_url" text,
	"terms_url" text,
	"status_page_url" text,
	"last_probe_ok" boolean DEFAULT false NOT NULL,
	"last_probe_status" integer,
	"last_probe_latency_ms" integer,
	"last_probe_error" text,
	"last_probed_at" timestamp,
	"created_by" text NOT NULL,
	"verified_by" text,
	"verified_at" timestamp,
	"activated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "provider_connection_slug_unique" UNIQUE("slug"),
	CONSTRAINT "provider_connection_slug_check" CHECK ("provider_connection"."slug" ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
	CONSTRAINT "provider_connection_protocol_check" CHECK ("provider_connection"."protocol" IN ('openai', 'anthropic', 'google', 'mistral')),
	CONSTRAINT "provider_connection_auth_scheme_check" CHECK ("provider_connection"."auth_scheme" IN ('bearer', 'anthropic', 'google-query')),
	CONSTRAINT "provider_connection_status_check" CHECK ("provider_connection"."status" IN ('draft', 'verifying', 'active', 'suspended')),
	CONSTRAINT "provider_connection_privacy_check" CHECK (("provider_connection"."zdr_verified" = false OR ("provider_connection"."zdr_capable" = true AND "provider_connection"."privacy_policy_url" IS NOT NULL)) AND ("provider_connection"."no_training_verified" = false OR "provider_connection"."privacy_policy_url" IS NOT NULL)),
	CONSTRAINT "provider_connection_active_check" CHECK ("provider_connection"."status" <> 'active' OR ("provider_connection"."last_probed_at" IS NOT NULL AND "provider_connection"."verified_by" IS NOT NULL AND "provider_connection"."verified_at" IS NOT NULL AND "provider_connection"."activated_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "provider_offering" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"provider_model_id" text NOT NULL,
	"canonical_model_id" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_unix" integer DEFAULT 0 NOT NULL,
	"context_length" integer DEFAULT 0 NOT NULL,
	"max_completion_tokens" integer DEFAULT 0 NOT NULL,
	"input_modalities" jsonb DEFAULT '["text"]'::jsonb NOT NULL,
	"output_modalities" jsonb DEFAULT '["text"]'::jsonb NOT NULL,
	"supported_parameters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quantization" text DEFAULT 'unknown' NOT NULL,
	"provider_ready" boolean DEFAULT true NOT NULL,
	"free" boolean DEFAULT false NOT NULL,
	"reported_prompt_price" numeric(30, 15),
	"reported_completion_price" numeric(30, 15),
	"cost_prompt_price" numeric(30, 15),
	"cost_completion_price" numeric(30, 15),
	"commission_bps" integer DEFAULT 0 NOT NULL,
	"pricing_verified" boolean DEFAULT false NOT NULL,
	"pricing_verified_by" text,
	"pricing_verified_at" timestamp,
	"capacity_tpm" bigint,
	"deprecation_at" timestamp,
	"source_hash" text NOT NULL,
	"status" text DEFAULT 'staged' NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "provider_offering_status_check" CHECK ("provider_offering"."status" IN ('staged', 'active', 'suspended')),
	CONSTRAINT "provider_offering_commission_check" CHECK ("provider_offering"."commission_bps" BETWEEN 0 AND 10000),
	CONSTRAINT "provider_offering_capacity_check" CHECK ("provider_offering"."capacity_tpm" IS NULL OR "provider_offering"."capacity_tpm" >= 0),
	CONSTRAINT "provider_offering_token_limits_check" CHECK ("provider_offering"."context_length" >= 0 AND "provider_offering"."max_completion_tokens" >= 0),
	CONSTRAINT "provider_offering_price_check" CHECK (("provider_offering"."cost_prompt_price" IS NULL OR "provider_offering"."cost_prompt_price" >= 0) AND ("provider_offering"."cost_completion_price" IS NULL OR "provider_offering"."cost_completion_price" >= 0)),
	CONSTRAINT "provider_offering_active_check" CHECK ("provider_offering"."status" <> 'active' OR ("provider_offering"."provider_ready" = true AND "provider_offering"."pricing_verified" = true AND "provider_offering"."pricing_verified_by" IS NOT NULL AND "provider_offering"."pricing_verified_at" IS NOT NULL AND "provider_offering"."cost_prompt_price" IS NOT NULL AND "provider_offering"."cost_completion_price" IS NOT NULL AND (("provider_offering"."free" = true AND "provider_offering"."cost_prompt_price" = 0 AND "provider_offering"."cost_completion_price" = 0) OR ("provider_offering"."free" = false AND ("provider_offering"."cost_prompt_price" > 0 OR "provider_offering"."cost_completion_price" > 0)))))
);
--> statement-breakpoint
ALTER TABLE "provider_connection" ADD CONSTRAINT "provider_connection_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_connection" ADD CONSTRAINT "provider_connection_verified_by_user_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_offering" ADD CONSTRAINT "provider_offering_connection_id_provider_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."provider_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_offering" ADD CONSTRAINT "provider_offering_pricing_verified_by_user_id_fk" FOREIGN KEY ("pricing_verified_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_connection_status_idx" ON "provider_connection" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_offering_connection_model_uidx" ON "provider_offering" USING btree ("connection_id","provider_model_id");--> statement-breakpoint
CREATE INDEX "provider_offering_canonical_status_idx" ON "provider_offering" USING btree ("canonical_model_id","status");--> statement-breakpoint
CREATE INDEX "provider_offering_connection_status_idx" ON "provider_offering" USING btree ("connection_id","status");
