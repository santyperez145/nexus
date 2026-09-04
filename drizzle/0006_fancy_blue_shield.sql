CREATE TABLE "stripe_webhook_event" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"stripe_created_at" timestamp NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	"last_error" text
);
--> statement-breakpoint
CREATE INDEX "stripe_webhook_event_status_idx" ON "stripe_webhook_event" USING btree ("status","last_attempt_at");--> statement-breakpoint
CREATE INDEX "stripe_webhook_event_received_idx" ON "stripe_webhook_event" USING btree ("received_at");