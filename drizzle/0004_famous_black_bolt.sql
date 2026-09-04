ALTER TABLE "guardrail" ADD COLUMN "allowed_providers" jsonb;--> statement-breakpoint
ALTER TABLE "guardrail" ADD COLUMN "enforce_zdr" boolean DEFAULT false NOT NULL;