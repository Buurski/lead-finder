// Postgres-skema for Kinly HQ (spec: docs/superpowers/specs/2026-09-22-kinly-crm-hq-design.md §3).
// Fase 1 er en strangler: kolonnerne spejler de gamle Sheets/KV-felter ordret
// (strenge forbliver strenge) så de eksisterende funktions-signaturer kan
// roundtrippe loss-frit. Stramning (enums, CHECK) kommer når kalderne flyttes.
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  index,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const appUser = pgTable("app_user", {
  id: text("id").primaryKey(), // "lucas" | "charlie"
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
});

export const company = pgTable(
  "company",
  {
    id: id(),
    // Sheets-rækkenummeret fra Leads-fanen. Lead.id = String(rowNo), og
    // rowIndex = rowNo - 2 i alle gamle kald. Skifter aldrig (arkivering sletter ikke).
    rowNo: integer("row_no").notNull().unique(),
    clientNo: integer("client_no").unique(), // Clients-fanens rækkenummer; null = ikke kunde
    // Fjernet som kunde. clientNo beholdes, så et Client.id aldrig genbruges af en anden virksomhed.
    clientRemoved: boolean("client_removed").notNull().default(false),
    lifecycle: text("lifecycle").notNull().default("ny"),
    archived: boolean("archived").notNull().default(false),
    name: text("name").notNull().default(""),
    branch: text("branch").notNull().default(""),
    phone: text("phone").notNull().default(""),
    city: text("city").notNull().default(""),
    score: integer("score").notNull().default(0),
    source: text("source").notNull().default(""),
    website: text("website").notNull().default(""),
    websiteStatus: text("website_status").notNull().default("none"),
    leadStatus: text("lead_status").notNull().default("new"),
    notes: text("notes").notNull().default(""),
    lastUpdated: text("last_updated").notNull().default(""),
    websiteQualityTier: text("website_quality_tier").notNull().default(""),
    enrichedInfo: text("enriched_info").notNull().default(""),
    email: text("email").notNull().default(""),
    emailSentAt: text("email_sent_at").notNull().default(""),
    emailOpenedAt: text("email_opened_at").notNull().default(""),
    emailClickedAt: text("email_clicked_at").notNull().default(""),
    emailStatus: text("email_status").notNull().default(""),
    followupSentAt: text("followup_sent_at").notNull().default(""),
    reviewsCount: integer("reviews_count").notNull().default(0),
    callbackDate: text("callback_date").notNull().default(""),
    skipReason: text("skip_reason").notNull().default(""),
    placeId: text("place_id"),
    businessStatus: text("business_status"),
    owner: text("owner"),
    jevGrade: text("jev_grade"),
    jevScore: integer("jev_score"),
    briefFilled: boolean("brief_filled").notNull().default(false),
    maxTouches: integer("max_touches"), // loft for antal mails i sekvensen (null = standard 3)
    services: text("services").array().notNull().default(sql`'{}'::text[]`), // hvad vi leverer: hjemmeside, hosting, cms, seo …
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("company_place_id_uq").on(t.placeId).where(sql`${t.placeId} is not null`)],
);

export const contact = pgTable("contact", {
  id: id(),
  legacyId: text("legacy_id").unique(),
  companyId: uuid("company_id").references(() => company.id),
  clientName: text("client_name").notNull().default(""),
  name: text("name").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  role: text("role").notNull().default(""),
  newsletterOk: boolean("newsletter_ok").notNull().default(false),
  data: jsonb("data"), // hele det gamle CrmContact-objekt (loss-fri)
  createdAt: createdAt(),
});

export const deal = pgTable(
  "deal",
  {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => company.id),
  isPrimary: boolean("is_primary").notNull().default(false),
  title: text("title").notNull().default(""),
  kind: text("kind").notNull().default("engang"),
  stage: text("stage").notNull().default(""),
  package: text("package").notNull().default(""),
  source: text("source").notNull().default(""),
  owner: text("owner").notNull().default(""),
  setupFeeRaw: text("setup_fee_raw").notNull().default(""),
  monthlyFeeRaw: text("monthly_fee_raw").notNull().default(""),
  valueDkk: integer("value_dkk"),
  mrrDkk: integer("mrr_dkk"),
  nextStep: text("next_step"),
  nextStepDue: text("next_step_due"),
  expectedClose: text("expected_close").notNull().default(""),
  wonAt: text("won_at").notNull().default(""),
  lostAt: text("lost_at").notNull().default(""),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  },
  // Højst én primær deal pr. virksomhed (Client-rækkens deal-felter).
  (t) => [uniqueIndex("deal_one_primary_uq").on(t.companyId).where(sql`${t.isPrimary}`)],
);

export const site = pgTable("site", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => company.id),
  status: text("status").notNull().default("demo"),
  projectFolder: text("project_folder").notNull().default(""),
  vercelProject: text("vercel_project"),
  domain: text("domain"),
  cmsUrl: text("cms_url"),
  lastDeployAt: timestamp("last_deploy_at", { withTimezone: true }),
  lastDeployUrl: text("last_deploy_url"),
  // Dagligt tjek af det live site (cron site-health): {checkedAt, ok, status, ms, sslDaysLeft, error, downSince}
  health: jsonb("health"),
});

export const seoSnapshot = pgTable("seo_snapshot", {
  id: id(),
  companyId: uuid("company_id").references(() => company.id),
  url: text("url").notNull(),
  takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
  performance: integer("performance"),
  seo: integer("seo"),
  accessibility: integer("accessibility"),
  bestPractices: integer("best_practices"),
  onpage: integer("onpage"),
  lcpMs: integer("lcp_ms"),
  cls: numeric("cls"),
  issues: jsonb("issues").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
}, (t) => [index("seo_snapshot_company_taken_idx").on(t.companyId, t.takenAt)]);

export const activity = pgTable("activity", {
  id: id(),
  legacyId: text("legacy_id").unique(),
  companyId: uuid("company_id").references(() => company.id),
  dealId: uuid("deal_id").references(() => deal.id),
  clientName: text("client_name").notNull().default(""),
  actor: text("actor").notNull().default("system"),
  type: text("type").notNull(),
  summary: text("summary").notNull().default(""),
  payload: jsonb("payload"),
  billableDkk: integer("billable_dkk"),
  invoicedAt: timestamp("invoiced_at", { withTimezone: true }),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export const task = pgTable("task", {
  id: id(),
  legacyId: text("legacy_id").unique(),
  companyId: uuid("company_id").references(() => company.id),
  dealId: uuid("deal_id").references(() => deal.id),
  clientName: text("client_name").notNull().default(""),
  owner: text("owner").notNull().default(""),
  title: text("title").notNull().default(""),
  due: text("due").notNull().default(""),
  doneAt: timestamp("done_at", { withTimezone: true }),
  data: jsonb("data"),
  createdAt: createdAt(),
});

// Kladde-køen. `draft` er hele QueueDraft-objektet (loss-fri); de typede
// kolonner findes kun for at kunne filtrere/joine.
export const outreach = pgTable("outreach", {
  id: text("id").primaryKey(),
  companyRowNo: integer("company_row_no"),
  position: integer("position").notNull().default(0), // rækkefølgen i den skrevne kø
  step: integer("step").notNull().default(1), // 1 = første mail, 2.. = opfølgninger
  angle: text("angle"), // opfølgningens vinkel (gratis_udkast, seo_tjek, eksempel, sidste)
  kind: text("kind").notNull().default("kold"),
  status: text("status").notNull(),
  sender: text("sender"),
  sentBy: text("sent_by"),
  draft: jsonb("draft").notNull(),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

export const invoice = pgTable("invoice", {
  number: text("number").primaryKey(),
  companyId: uuid("company_id").references(() => company.id),
  clientName: text("client_name").notNull(),
  status: text("status").notNull(),
  issueDate: text("issue_date").notNull(),
  dueDate: text("due_date").notNull(),
  data: jsonb("data").notNull(), // hele Invoice-objektet
  dineroId: text("dinero_id"),
});

export const subscriptionPlan = pgTable("subscription_plan", {
  clientName: text("client_name").primaryKey(),
  companyId: uuid("company_id").references(() => company.id),
  position: integer("position").notNull().default(0),
  data: jsonb("data").notNull(), // hele Subscription-objektet (invoices.ts)
});

export const counter = pgTable("counter", {
  name: text("name").primaryKey(),
  value: integer("value").notNull(),
});

export const loginToken = pgTable("login_token", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});
