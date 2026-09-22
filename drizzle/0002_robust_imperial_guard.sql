ALTER TABLE "company" ADD COLUMN "max_touches" integer;--> statement-breakpoint
ALTER TABLE "outreach" ADD COLUMN "step" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "outreach" ADD COLUMN "angle" text;