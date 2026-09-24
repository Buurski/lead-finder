CREATE TABLE "blog_post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"slug" text DEFAULT '' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"stage" text DEFAULT 'ide' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"source_path" text DEFAULT '' NOT NULL,
	"images" jsonb DEFAULT '{"a":null,"b":null,"choice":"none"}'::jsonb NOT NULL,
	"publish_requested_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"published_url" text,
	"created_by" text DEFAULT '' NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "blog_post_slug_uq" ON "blog_post" USING btree ("slug") WHERE "blog_post"."slug" <> '';