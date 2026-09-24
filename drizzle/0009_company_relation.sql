CREATE TABLE "company_relation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"a_id" uuid NOT NULL,
	"b_id" uuid NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_relation_order" CHECK ("company_relation"."a_id" < "company_relation"."b_id")
);
--> statement-breakpoint
ALTER TABLE "company_relation" ADD CONSTRAINT "company_relation_a_id_company_id_fk" FOREIGN KEY ("a_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_relation" ADD CONSTRAINT "company_relation_b_id_company_id_fk" FOREIGN KEY ("b_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_relation_pair_uq" ON "company_relation" USING btree ("a_id","b_id");--> statement-breakpoint
CREATE INDEX "company_relation_b_id_idx" ON "company_relation" USING btree ("b_id");