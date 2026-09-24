ALTER TABLE "task" ADD COLUMN "note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "important" boolean DEFAULT false NOT NULL;