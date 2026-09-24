ALTER TABLE "app_user" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "setup_hash" text;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "setup_expires_at" timestamp with time zone;