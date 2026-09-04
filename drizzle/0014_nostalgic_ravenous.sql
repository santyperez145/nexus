DROP INDEX "hub_repository_namespace_slug_uidx";--> statement-breakpoint
ALTER TABLE "hub_repository" ADD COLUMN "kind" text DEFAULT 'dataset' NOT NULL;--> statement-breakpoint
ALTER TABLE "hub_repository" ADD COLUMN "model_card" text;--> statement-breakpoint
ALTER TABLE "hub_repository" ADD COLUMN "library_name" text;--> statement-breakpoint
ALTER TABLE "hub_repository" ADD COLUMN "base_model" text;--> statement-breakpoint
CREATE UNIQUE INDEX "hub_repository_kind_namespace_slug_uidx" ON "hub_repository" USING btree ("kind","namespace_id","slug");--> statement-breakpoint
ALTER TABLE "hub_repository" ADD CONSTRAINT "hub_repository_kind_check" CHECK ("hub_repository"."kind" IN ('dataset', 'model'));