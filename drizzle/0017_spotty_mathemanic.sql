CREATE TABLE "hub_model_evaluation" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"benchmark" text NOT NULL,
	"task" text NOT NULL,
	"dataset" text NOT NULL,
	"dataset_revision" text,
	"metric" text NOT NULL,
	"metric_value" numeric(30, 12) NOT NULL,
	"higher_is_better" boolean DEFAULT true NOT NULL,
	"sample_count" integer,
	"evaluator" text NOT NULL,
	"evaluator_version" text,
	"evidence_url" text NOT NULL,
	"evidence_sha256" text NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"submitted_by" text NOT NULL,
	"reviewed_by" text,
	"review_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	CONSTRAINT "hub_model_evaluation_status_check" CHECK ("hub_model_evaluation"."status" IN ('submitted', 'verified', 'rejected')),
	CONSTRAINT "hub_model_evaluation_sample_count_check" CHECK ("hub_model_evaluation"."sample_count" IS NULL OR "hub_model_evaluation"."sample_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "hub_model_promotion_request" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"runtime_model_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by" text NOT NULL,
	"reviewed_by" text,
	"review_note" text,
	"checklist" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	CONSTRAINT "hub_model_promotion_status_check" CHECK ("hub_model_promotion_request"."status" IN ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "hub_repository" ADD COLUMN "verification_status" text DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE "hub_repository" ADD COLUMN "verified_revision" integer;--> statement-breakpoint
ALTER TABLE "hub_repository" ADD COLUMN "runtime_model_id" text;--> statement-breakpoint
ALTER TABLE "hub_repository" ADD COLUMN "verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "hub_repository" ADD COLUMN "verified_by" text;--> statement-breakpoint
ALTER TABLE "hub_model_evaluation" ADD CONSTRAINT "hub_model_evaluation_repository_id_hub_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."hub_repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_model_evaluation" ADD CONSTRAINT "hub_model_evaluation_revision_id_hub_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."hub_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_model_evaluation" ADD CONSTRAINT "hub_model_evaluation_submitted_by_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_model_evaluation" ADD CONSTRAINT "hub_model_evaluation_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_model_promotion_request" ADD CONSTRAINT "hub_model_promotion_request_repository_id_hub_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."hub_repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_model_promotion_request" ADD CONSTRAINT "hub_model_promotion_request_revision_id_hub_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."hub_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_model_promotion_request" ADD CONSTRAINT "hub_model_promotion_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_model_promotion_request" ADD CONSTRAINT "hub_model_promotion_request_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hub_model_evaluation_repository_status_idx" ON "hub_model_evaluation" USING btree ("repository_id","status","created_at");--> statement-breakpoint
CREATE INDEX "hub_model_evaluation_revision_status_idx" ON "hub_model_evaluation" USING btree ("revision_id","status");--> statement-breakpoint
CREATE INDEX "hub_model_promotion_repository_status_idx" ON "hub_model_promotion_request" USING btree ("repository_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "hub_model_promotion_pending_uidx" ON "hub_model_promotion_request" USING btree ("repository_id","revision_id") WHERE "hub_model_promotion_request"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "hub_model_promotion_status_created_idx" ON "hub_model_promotion_request" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "hub_repository" ADD CONSTRAINT "hub_repository_verified_by_user_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_repository" ADD CONSTRAINT "hub_repository_verification_status_check" CHECK ("hub_repository"."verification_status" IN ('unverified', 'pending', 'verified', 'rejected', 'stale'));--> statement-breakpoint
ALTER TABLE "hub_repository" ADD CONSTRAINT "hub_repository_verification_shape_check" CHECK (("hub_repository"."verification_status" = 'verified' AND "hub_repository"."verified_revision" IS NOT NULL AND "hub_repository"."runtime_model_id" IS NOT NULL AND "hub_repository"."verified_at" IS NOT NULL) OR "hub_repository"."verification_status" <> 'verified');
