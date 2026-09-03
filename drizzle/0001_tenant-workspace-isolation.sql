ALTER TABLE "chat_share" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "video_job" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "chat_share" ADD CONSTRAINT "chat_share_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_job" ADD CONSTRAINT "video_job_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE set null ON UPDATE no action;