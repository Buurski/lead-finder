CREATE TABLE "newsletter_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"provider" text DEFAULT 'brevo' NOT NULL,
	"account" text NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lists" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"campaigns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"domain" jsonb
);
--> statement-breakpoint
ALTER TABLE "newsletter_snapshot" ADD CONSTRAINT "newsletter_snapshot_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "newsletter_snapshot_account_taken_idx" ON "newsletter_snapshot" USING btree ("account","taken_at");