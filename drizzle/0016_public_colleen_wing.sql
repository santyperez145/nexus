ALTER TABLE "file" DROP CONSTRAINT "file_status_check";--> statement-breakpoint
ALTER TABLE "file" DROP CONSTRAINT "file_storage_shape_check";--> statement-breakpoint
ALTER TABLE "file" ADD COLUMN "storage_upload_id" text;--> statement-breakpoint
ALTER TABLE "file" ADD COLUMN "storage_part_size" bigint;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_status_check" CHECK ("file"."status" IN ('pending', 'completing', 'ready', 'failed'));--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_storage_shape_check" CHECK (("file"."storage_backend" = 'database' AND "file"."storage_key" IS NULL AND "file"."storage_upload_id" IS NULL AND "file"."storage_part_size" IS NULL) OR ("file"."storage_backend" = 's3' AND "file"."storage_key" IS NOT NULL AND (("file"."storage_upload_id" IS NULL AND "file"."storage_part_size" IS NULL) OR ("file"."storage_upload_id" IS NOT NULL AND "file"."storage_part_size" IS NOT NULL))));