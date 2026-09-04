ALTER TABLE "credit_ledger" ADD COLUMN "stripe_payment_intent_id" text;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD COLUMN "stripe_amount_minor" integer;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD COLUMN "stripe_currency" text;--> statement-breakpoint
CREATE INDEX "ledger_stripe_payment_intent_idx" ON "credit_ledger" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_purchase_payment_intent_uidx" ON "credit_ledger" USING btree ("stripe_payment_intent_id") WHERE "credit_ledger"."type" = 'purchase' AND "credit_ledger"."stripe_payment_intent_id" IS NOT NULL;