ALTER TABLE "api_key" ADD COLUMN "pending_reveal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "api_key" AS candidate
SET "pending_reveal" = true, "disabled" = true
FROM "user" AS owner
WHERE owner."id" = candidate."user_id"
  AND candidate."name" = 'Default'
  AND candidate."last_used_at" IS NULL
  AND candidate."disabled" = false
  AND candidate."created_at" <= owner."created_at" + interval '10 minutes'
  AND (SELECT count(*) FROM "api_key" AS sibling WHERE sibling."user_id" = candidate."user_id") = 1;--> statement-breakpoint
CREATE UNIQUE INDEX "api_key_pending_reveal_user_uidx" ON "api_key" USING btree ("user_id") WHERE "api_key"."pending_reveal" = true;
