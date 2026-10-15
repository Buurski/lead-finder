CREATE TABLE "marketing_draft" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ext_key" text,
	"track" text DEFAULT 'faceless' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"hook" text DEFAULT '' NOT NULL,
	"script" text DEFAULT '' NOT NULL,
	"shotlist" text DEFAULT '' NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"priority" integer DEFAULT 2 NOT NULL,
	"score" integer,
	"status" text DEFAULT 'kladde' NOT NULL,
	"planned_for" date,
	"length_s" integer,
	"music_kind" text DEFAULT 'ingen' NOT NULL,
	"music_license" text DEFAULT '' NOT NULL,
	"music_note" text DEFAULT '' NOT NULL,
	"customer_case" boolean DEFAULT false NOT NULL,
	"customer_ok" boolean DEFAULT false NOT NULL,
	"charlie_ok" boolean DEFAULT false NOT NULL,
	"true_checked_on" date,
	"risk" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'manuel' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_measure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"posted_on" date NOT NULL,
	"draft_id" uuid,
	"ab_id" uuid,
	"arm" text DEFAULT '' NOT NULL,
	"par_id" text DEFAULT '' NOT NULL,
	"arm_assigned" text DEFAULT '' NOT NULL,
	"post_url" text DEFAULT '' NOT NULL,
	"views" integer,
	"saves" integer,
	"shares" integer,
	"new_followers" integer,
	"profile_visits" integer,
	"link_clicks" integer,
	"inquiries" integer,
	"skip_pct" real,
	"full_view_pct" real,
	"watch_s" real,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_ref" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ext_key" text,
	"kind" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_draft_ext_key_uq" ON "marketing_draft" USING btree ("ext_key") WHERE "marketing_draft"."ext_key" is not null;--> statement-breakpoint
CREATE INDEX "marketing_measure_posted_idx" ON "marketing_measure" USING btree ("posted_on");--> statement-breakpoint
CREATE INDEX "marketing_measure_ab_idx" ON "marketing_measure" USING btree ("ab_id");--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_ref_ext_key_uq" ON "marketing_ref" USING btree ("ext_key") WHERE "marketing_ref"."ext_key" is not null;--> statement-breakpoint
CREATE INDEX "marketing_ref_kind_idx" ON "marketing_ref" USING btree ("kind");