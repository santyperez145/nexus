ALTER TABLE "video_job" ALTER COLUMN "prompt" DROP NOT NULL;--> statement-breakpoint
UPDATE "generation"
SET
	"prompt" = NULL,
	"completion" = NULL,
	"metadata" = CASE
		WHEN "metadata" IS NULL THEN NULL
		ELSE "metadata" - 'filename'
	END
WHERE "user_id" IN (
	SELECT "id"
	FROM "user"
	WHERE "zdr" = true OR "log_prompts" = false
);--> statement-breakpoint
UPDATE "video_job"
SET "prompt" = NULL
WHERE "user_id" IN (
	SELECT "id"
	FROM "user"
	WHERE "zdr" = true OR "log_prompts" = false
);--> statement-breakpoint
UPDATE "video_job"
SET "result_url" = NULL
WHERE "user_id" IN (
	SELECT "id"
	FROM "user"
	WHERE "zdr" = true
);--> statement-breakpoint
UPDATE "user"
SET "log_prompts" = false
WHERE "zdr" = true AND "log_prompts" = true;
