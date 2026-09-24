CREATE TABLE "seo_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"url" text NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"performance" integer,
	"seo" integer,
	"accessibility" integer,
	"best_practices" integer,
	"onpage" integer,
	"lcp_ms" integer,
	"cls" numeric,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seo_snapshot" ADD CONSTRAINT "seo_snapshot_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seo_snapshot_company_taken_idx" ON "seo_snapshot" USING btree ("company_id","taken_at");