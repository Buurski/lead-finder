ALTER TABLE "company" ADD COLUMN "client_removed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "outreach" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "deal_one_primary_uq" ON "deal" USING btree ("company_id") WHERE "deal"."is_primary";