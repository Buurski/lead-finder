ALTER TABLE "blog_post" ADD COLUMN "source" text DEFAULT 'agent' NOT NULL;--> statement-breakpoint
ALTER TABLE "blog_post" ADD COLUMN "scores" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "blog_post" ADD COLUMN "strengths" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "blog_post" ADD COLUMN "ratings" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "blog_post" ADD COLUMN "proofs" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "blog_post" ADD COLUMN "jev" jsonb;--> statement-breakpoint
ALTER TABLE "blog_post" ADD COLUMN "checklist" jsonb DEFAULT '{}'::jsonb NOT NULL;