ALTER TABLE "task" ADD COLUMN "note" text NOT NULL DEFAULT '';
ALTER TABLE "task" ADD COLUMN "important" boolean NOT NULL DEFAULT false;
