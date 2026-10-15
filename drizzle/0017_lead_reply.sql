CREATE TABLE "lead_reply" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"account" text NOT NULL,
	"message_id" text NOT NULL,
	"thread_id" text,
	"received_at" timestamp with time zone NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"snippet" text,
	"category" text DEFAULT 'other' NOT NULL,
	"asks_call" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_reply_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
ALTER TABLE "lead_reply" ADD CONSTRAINT "lead_reply_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_reply_company_received_idx" ON "lead_reply" USING btree ("company_id","received_at");