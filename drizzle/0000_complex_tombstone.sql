CREATE TABLE "activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"company_id" uuid,
	"deal_id" uuid,
	"client_name" text DEFAULT '' NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL,
	"type" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"payload" jsonb,
	"billable_dkk" integer,
	"invoiced_at" timestamp with time zone,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	CONSTRAINT "app_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "company" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"row_no" integer NOT NULL,
	"client_no" integer,
	"lifecycle" text DEFAULT 'ny' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"branch" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"website_status" text DEFAULT 'none' NOT NULL,
	"lead_status" text DEFAULT 'new' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"last_updated" text DEFAULT '' NOT NULL,
	"website_quality_tier" text DEFAULT '' NOT NULL,
	"enriched_info" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"email_sent_at" text DEFAULT '' NOT NULL,
	"email_opened_at" text DEFAULT '' NOT NULL,
	"email_clicked_at" text DEFAULT '' NOT NULL,
	"email_status" text DEFAULT '' NOT NULL,
	"followup_sent_at" text DEFAULT '' NOT NULL,
	"reviews_count" integer DEFAULT 0 NOT NULL,
	"callback_date" text DEFAULT '' NOT NULL,
	"skip_reason" text DEFAULT '' NOT NULL,
	"place_id" text,
	"business_status" text,
	"owner" text,
	"jev_grade" text,
	"jev_score" integer,
	"brief_filled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_row_no_unique" UNIQUE("row_no"),
	CONSTRAINT "company_client_no_unique" UNIQUE("client_no")
);
--> statement-breakpoint
CREATE TABLE "contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"company_id" uuid,
	"client_name" text DEFAULT '' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"newsletter_ok" boolean DEFAULT false NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "counter" (
	"name" text PRIMARY KEY NOT NULL,
	"value" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'engang' NOT NULL,
	"stage" text DEFAULT '' NOT NULL,
	"package" text DEFAULT '' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"owner" text DEFAULT '' NOT NULL,
	"setup_fee_raw" text DEFAULT '' NOT NULL,
	"monthly_fee_raw" text DEFAULT '' NOT NULL,
	"value_dkk" integer,
	"mrr_dkk" integer,
	"next_step" text,
	"next_step_due" text,
	"expected_close" text DEFAULT '' NOT NULL,
	"won_at" text DEFAULT '' NOT NULL,
	"lost_at" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice" (
	"number" text PRIMARY KEY NOT NULL,
	"company_id" uuid,
	"client_name" text NOT NULL,
	"status" text NOT NULL,
	"issue_date" text NOT NULL,
	"due_date" text NOT NULL,
	"data" jsonb NOT NULL,
	"dinero_id" text
);
--> statement-breakpoint
CREATE TABLE "login_token" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "outreach" (
	"id" text PRIMARY KEY NOT NULL,
	"company_row_no" integer,
	"kind" text DEFAULT 'kold' NOT NULL,
	"status" text NOT NULL,
	"sender" text,
	"sent_by" text,
	"draft" jsonb NOT NULL,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"status" text DEFAULT 'demo' NOT NULL,
	"project_folder" text DEFAULT '' NOT NULL,
	"vercel_project" text,
	"domain" text,
	"cms_url" text,
	"last_deploy_at" timestamp with time zone,
	"last_deploy_url" text
);
--> statement-breakpoint
CREATE TABLE "subscription_plan" (
	"client_name" text PRIMARY KEY NOT NULL,
	"company_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text,
	"company_id" uuid,
	"deal_id" uuid,
	"client_name" text DEFAULT '' NOT NULL,
	"owner" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"due" text DEFAULT '' NOT NULL,
	"done_at" timestamp with time zone,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site" ADD CONSTRAINT "site_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_plan" ADD CONSTRAINT "subscription_plan_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_place_id_uq" ON "company" USING btree ("place_id") WHERE "company"."place_id" is not null;