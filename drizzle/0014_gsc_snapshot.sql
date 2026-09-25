CREATE TABLE "gsc_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"property" text NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"period_start" text NOT NULL,
	"period_end" text NOT NULL,
	"clicks" integer NOT NULL,
	"impressions" integer NOT NULL,
	"position" real,
	"top_queries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"daily" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gsc_snapshot" ADD CONSTRAINT "gsc_snapshot_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gsc_snapshot_company_taken_idx" ON "gsc_snapshot" USING btree ("company_id","taken_at");