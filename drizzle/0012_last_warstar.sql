CREATE TABLE "hub_access_grant" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"decided_at" timestamp,
	"decided_by" text,
	CONSTRAINT "hub_access_grant_status_check" CHECK ("hub_access_grant"."status" IN ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "hub_namespace" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hub_repository" (
	"id" text PRIMARY KEY NOT NULL,
	"namespace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"gated" boolean DEFAULT false NOT NULL,
	"license" text DEFAULT 'other' NOT NULL,
	"task" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"latest_revision" integer DEFAULT 0 NOT NULL,
	"downloads" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hub_repository_visibility_check" CHECK ("hub_repository"."visibility" IN ('public', 'private')),
	CONSTRAINT "hub_repository_revision_check" CHECK ("hub_repository"."latest_revision" >= 0),
	CONSTRAINT "hub_repository_downloads_check" CHECK ("hub_repository"."downloads" >= 0)
);
--> statement-breakpoint
CREATE TABLE "hub_revision_file" (
	"id" text PRIMARY KEY NOT NULL,
	"revision_id" text NOT NULL,
	"file_id" text NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hub_revision" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"revision" integer NOT NULL,
	"commit_sha" text NOT NULL,
	"commit_message" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hub_revision_number_check" CHECK ("hub_revision"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "hub_access_grant" ADD CONSTRAINT "hub_access_grant_repository_id_hub_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."hub_repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_access_grant" ADD CONSTRAINT "hub_access_grant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_access_grant" ADD CONSTRAINT "hub_access_grant_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_namespace" ADD CONSTRAINT "hub_namespace_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_namespace" ADD CONSTRAINT "hub_namespace_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_repository" ADD CONSTRAINT "hub_repository_namespace_id_hub_namespace_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."hub_namespace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_repository" ADD CONSTRAINT "hub_repository_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_repository" ADD CONSTRAINT "hub_repository_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_revision_file" ADD CONSTRAINT "hub_revision_file_revision_id_hub_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."hub_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_revision_file" ADD CONSTRAINT "hub_revision_file_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_revision" ADD CONSTRAINT "hub_revision_repository_id_hub_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."hub_repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_revision" ADD CONSTRAINT "hub_revision_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hub_access_grant_repository_user_uidx" ON "hub_access_grant" USING btree ("repository_id","user_id");--> statement-breakpoint
CREATE INDEX "hub_access_grant_repository_status_idx" ON "hub_access_grant" USING btree ("repository_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "hub_namespace_slug_uidx" ON "hub_namespace" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "hub_namespace_personal_owner_uidx" ON "hub_namespace" USING btree ("user_id") WHERE "hub_namespace"."workspace_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "hub_namespace_workspace_uidx" ON "hub_namespace" USING btree ("workspace_id") WHERE "hub_namespace"."workspace_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "hub_repository_namespace_slug_uidx" ON "hub_repository" USING btree ("namespace_id","slug");--> statement-breakpoint
CREATE INDEX "hub_repository_public_updated_idx" ON "hub_repository" USING btree ("updated_at") WHERE "hub_repository"."visibility" = 'public';--> statement-breakpoint
CREATE INDEX "hub_repository_user_idx" ON "hub_repository" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "hub_repository_workspace_idx" ON "hub_repository" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "hub_revision_file_path_uidx" ON "hub_revision_file" USING btree ("revision_id","path");--> statement-breakpoint
CREATE INDEX "hub_revision_file_file_idx" ON "hub_revision_file" USING btree ("file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hub_revision_repository_number_uidx" ON "hub_revision" USING btree ("repository_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "hub_revision_repository_sha_uidx" ON "hub_revision" USING btree ("repository_id","commit_sha");--> statement-breakpoint
CREATE INDEX "hub_revision_repository_created_idx" ON "hub_revision" USING btree ("repository_id","created_at");