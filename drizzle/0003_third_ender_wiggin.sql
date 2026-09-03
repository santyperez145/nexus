CREATE TABLE "workspace_member" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_member" ADD CONSTRAINT "workspace_member_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_member" ADD CONSTRAINT "workspace_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_member_unique" ON "workspace_member" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "workspace_member_user_idx" ON "workspace_member" USING btree ("user_id");--> statement-breakpoint
WITH ranked AS (
	SELECT "id", row_number() OVER (PARTITION BY "organization_id" ORDER BY "created_at", "id") AS position
	FROM "workspace"
	WHERE "organization_id" IS NOT NULL
), organizations_without_default AS (
	SELECT DISTINCT "organization_id"
	FROM "workspace"
	WHERE "organization_id" IS NOT NULL
	GROUP BY "organization_id"
	HAVING bool_or("is_default") = false
)
UPDATE "workspace" AS workspace
SET "is_default" = true
FROM ranked, organizations_without_default
WHERE workspace."id" = ranked."id"
	AND workspace."organization_id" = organizations_without_default."organization_id"
	AND ranked.position = 1;--> statement-breakpoint
UPDATE "workspace" AS workspace
SET "slug" = left(workspace."slug", 80) || '-' || substr(md5(workspace."id"), 1, 8)
FROM "organization" AS organization
WHERE workspace."organization_id" = organization."id"
	AND workspace."user_id" <> organization."owner_id"
	AND (
		EXISTS (
			SELECT 1 FROM "workspace" AS conflict
			WHERE conflict."user_id" = organization."owner_id"
				AND conflict."slug" = workspace."slug"
				AND conflict."id" <> workspace."id"
		)
		OR EXISTS (
			SELECT 1 FROM "workspace" AS sibling
			WHERE sibling."organization_id" = workspace."organization_id"
				AND sibling."slug" = workspace."slug"
				AND sibling."id" <> workspace."id"
		)
	);--> statement-breakpoint
UPDATE "workspace" AS workspace
SET "user_id" = organization."owner_id"
FROM "organization" AS organization
WHERE workspace."organization_id" = organization."id"
	AND workspace."user_id" <> organization."owner_id";--> statement-breakpoint
INSERT INTO "workspace_member" ("id", "workspace_id", "user_id")
SELECT
	'wsm_' || substr(md5(workspace."id" || ':' || member."user_id"), 1, 24),
	workspace."id",
	member."user_id"
FROM "workspace" AS workspace
INNER JOIN "organization_member" AS member
	ON member."organization_id" = workspace."organization_id"
ON CONFLICT ("workspace_id", "user_id") DO NOTHING;
