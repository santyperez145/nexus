UPDATE "byok_credential" AS credential
SET "deleted" = true, "encrypted_key" = '', "workspace_id" = NULL
WHERE credential."workspace_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "workspace" WHERE "workspace"."id" = credential."workspace_id"
  );--> statement-breakpoint
WITH ranked AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "user_id", "provider"
    ORDER BY "created_at" DESC, "id" DESC
  ) AS position
  FROM "byok_credential"
  WHERE "deleted" = false AND "workspace_id" IS NULL
)
UPDATE "byok_credential" AS credential
SET "deleted" = true, "encrypted_key" = ''
FROM ranked
WHERE credential."id" = ranked."id" AND ranked.position > 1;--> statement-breakpoint
WITH ranked AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "workspace_id", "provider"
    ORDER BY "created_at" DESC, "id" DESC
  ) AS position
  FROM "byok_credential"
  WHERE "deleted" = false AND "workspace_id" IS NOT NULL
)
UPDATE "byok_credential" AS credential
SET "deleted" = true, "encrypted_key" = ''
FROM ranked
WHERE credential."id" = ranked."id" AND ranked.position > 1;--> statement-breakpoint
ALTER TABLE "byok_credential" ADD CONSTRAINT "byok_credential_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "byok_account_provider_active_uidx" ON "byok_credential" USING btree ("user_id","provider") WHERE "byok_credential"."workspace_id" IS NULL AND "byok_credential"."deleted" = false;--> statement-breakpoint
CREATE UNIQUE INDEX "byok_workspace_provider_active_uidx" ON "byok_credential" USING btree ("workspace_id","provider") WHERE "byok_credential"."workspace_id" IS NOT NULL AND "byok_credential"."deleted" = false;
