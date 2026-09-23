CREATE TABLE IF NOT EXISTS "seo_snapshot" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid REFERENCES "company"("id"),
  "url" text NOT NULL,
  "taken_at" timestamptz NOT NULL DEFAULT now(),
  "performance" integer,
  "seo" integer,
  "accessibility" integer,
  "best_practices" integer,
  "onpage" integer,
  "lcp_ms" integer,
  "cls" numeric,
  "issues" jsonb NOT NULL DEFAULT '[]'::jsonb
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seo_snapshot_company_taken_idx" ON "seo_snapshot" ("company_id", "taken_at");
