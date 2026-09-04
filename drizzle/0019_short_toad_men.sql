CREATE TABLE "hub_collection_item" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_id" text NOT NULL,
	"item_type" text NOT NULL,
	"item_path" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"position" integer NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hub_collection_item_type_check" CHECK ("hub_collection_item"."item_type" IN ('model', 'dataset', 'space')),
	CONSTRAINT "hub_collection_item_position_check" CHECK ("hub_collection_item"."position" BETWEEN 0 AND 999)
);
--> statement-breakpoint
CREATE TABLE "hub_collection" (
	"id" text PRIMARY KEY NOT NULL,
	"namespace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"theme" text DEFAULT 'indigo' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hub_collection_visibility_check" CHECK ("hub_collection"."visibility" IN ('public', 'private')),
	CONSTRAINT "hub_collection_theme_check" CHECK ("hub_collection"."theme" IN ('indigo', 'cyan', 'amber', 'emerald', 'rose', 'zinc'))
);
--> statement-breakpoint
ALTER TABLE "hub_collection_item" ADD CONSTRAINT "hub_collection_item_collection_id_hub_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."hub_collection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_collection_item" ADD CONSTRAINT "hub_collection_item_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_collection" ADD CONSTRAINT "hub_collection_namespace_id_hub_namespace_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."hub_namespace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_collection" ADD CONSTRAINT "hub_collection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_collection" ADD CONSTRAINT "hub_collection_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hub_collection_item_resource_uidx" ON "hub_collection_item" USING btree ("collection_id","item_type","item_path");--> statement-breakpoint
CREATE UNIQUE INDEX "hub_collection_item_position_uidx" ON "hub_collection_item" USING btree ("collection_id","position");--> statement-breakpoint
CREATE INDEX "hub_collection_item_collection_idx" ON "hub_collection_item" USING btree ("collection_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "hub_collection_namespace_slug_uidx" ON "hub_collection" USING btree ("namespace_id","slug");--> statement-breakpoint
CREATE INDEX "hub_collection_public_updated_idx" ON "hub_collection" USING btree ("updated_at") WHERE "hub_collection"."visibility" = 'public';--> statement-breakpoint
CREATE INDEX "hub_collection_user_idx" ON "hub_collection" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "hub_collection_workspace_idx" ON "hub_collection" USING btree ("workspace_id","updated_at");