CREATE TABLE "hub_space_run" (
	"id" text PRIMARY KEY NOT NULL,
	"space_id" text NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"generation_id" text,
	"model" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hub_space" (
	"id" text PRIMARY KEY NOT NULL,
	"namespace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"model" text NOT NULL,
	"system_prompt" text DEFAULT '' NOT NULL,
	"starter_prompt" text,
	"temperature_milli" integer DEFAULT 700 NOT NULL,
	"max_tokens" integer DEFAULT 1024 NOT NULL,
	"runs" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hub_space_visibility_check" CHECK ("hub_space"."visibility" IN ('public', 'private')),
	CONSTRAINT "hub_space_temperature_check" CHECK ("hub_space"."temperature_milli" BETWEEN 0 AND 2000),
	CONSTRAINT "hub_space_max_tokens_check" CHECK ("hub_space"."max_tokens" BETWEEN 1 AND 131072),
	CONSTRAINT "hub_space_runs_check" CHECK ("hub_space"."runs" >= 0)
);
--> statement-breakpoint
ALTER TABLE "hub_space_run" ADD CONSTRAINT "hub_space_run_space_id_hub_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."hub_space"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_space_run" ADD CONSTRAINT "hub_space_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_space_run" ADD CONSTRAINT "hub_space_run_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_space_run" ADD CONSTRAINT "hub_space_run_generation_id_generation_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_space" ADD CONSTRAINT "hub_space_namespace_id_hub_namespace_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."hub_namespace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_space" ADD CONSTRAINT "hub_space_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_space" ADD CONSTRAINT "hub_space_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hub_space_run_generation_uidx" ON "hub_space_run" USING btree ("generation_id") WHERE "hub_space_run"."generation_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "hub_space_run_space_created_idx" ON "hub_space_run" USING btree ("space_id","created_at");--> statement-breakpoint
CREATE INDEX "hub_space_run_user_created_idx" ON "hub_space_run" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "hub_space_namespace_slug_uidx" ON "hub_space" USING btree ("namespace_id","slug");--> statement-breakpoint
CREATE INDEX "hub_space_public_updated_idx" ON "hub_space" USING btree ("updated_at") WHERE "hub_space"."visibility" = 'public';--> statement-breakpoint
CREATE INDEX "hub_space_user_idx" ON "hub_space" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "hub_space_workspace_idx" ON "hub_space" USING btree ("workspace_id","updated_at");