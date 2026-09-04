ALTER TABLE "file" ALTER COLUMN "size" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "file" ADD COLUMN "storage_backend" text DEFAULT 'database' NOT NULL;--> statement-breakpoint
ALTER TABLE "file" ADD COLUMN "storage_key" text;--> statement-breakpoint
ALTER TABLE "file" ADD COLUMN "checksum_sha256" text;--> statement-breakpoint
ALTER TABLE "file" ADD COLUMN "etag" text;--> statement-breakpoint
ALTER TABLE "file" ADD COLUMN "status" text DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "file" ADD COLUMN "upload_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "file" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "file_storage_key_uidx" ON "file" USING btree ("storage_key") WHERE "file"."storage_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "file_user_status_created_idx" ON "file" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "file_workspace_status_created_idx" ON "file" USING btree ("workspace_id","status","created_at");--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_size_check" CHECK ("file"."size" >= 0);--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_storage_backend_check" CHECK ("file"."storage_backend" IN ('database', 's3'));--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_status_check" CHECK ("file"."status" IN ('pending', 'ready', 'failed'));--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_storage_shape_check" CHECK (("file"."storage_backend" = 'database' AND "file"."storage_key" IS NULL) OR ("file"."storage_backend" = 's3' AND "file"."storage_key" IS NOT NULL));