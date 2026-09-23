import { test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { freshTestDb } from "../db/test-db.ts";
import { activity, company, site } from "../db/schema.ts";
import { checkAllSites, nextHealth, siteUrl, type SiteHealth } from "./site-health.ts";

test("siteUrl: domæne før website, kun http(s), normaliseret til roden", () => {
  assert.equal(siteUrl("vida-klinik.dk", "https://andet.dk/x"), "https://vida-klinik.dk/");
  assert.equal(siteUrl(null, "http://ktvvs.dk/om"), "http://ktvvs.dk/");
  assert.equal(siteUrl("", ""), null);
  assert.equal(siteUrl("javascript:alert(1)", ""), null);
});

test("nextHealth: downSince holdes fra første fejl og nulstilles når sitet svarer", () => {
  const down = { ok: false, status: 503, ms: 10, sslDaysLeft: 40 };
  const a = nextHealth(null, down, "2026-09-20T05:00:00Z");
  const b = nextHealth(a, down, "2026-09-21T05:00:00Z");
  assert.equal(b.downSince, "2026-09-20T05:00:00Z");
  const c = nextHealth(b, { ...down, ok: true, status: 200 }, "2026-09-22T05:00:00Z");
  assert.equal(c.downSince, null);
});

test("checkAllSites: kun kunders sites; én aktivitet ved nedbrud og én ved genopretning", async () => {
  const db = await freshTestDb();
  const [kunde, lead] = await db
    .insert(company)
    .values([{ rowNo: -1, name: "VIDA", clientNo: 2 }, { rowNo: 9, name: "Lead", website: "https://lead.dk" }])
    .returning({ id: company.id });
  await db.insert(site).values([{ companyId: kunde.id, domain: "vida-klinik.dk", status: "live" }, { companyId: lead.id, status: "demo" }]);
  let up = false;
  const probeFn = async () => ({ ok: up, status: up ? 200 : 0, ms: 5, sslDaysLeft: 30, ...(up ? {} : { error: "timeout" }) });

  assert.deepEqual(await checkAllSites(db, { probeFn, now: Date.parse("2026-09-20T05:00:00Z") }), { checked: 1, down: ["VIDA"], recovered: [] });
  assert.deepEqual((await checkAllSites(db, { probeFn, now: Date.parse("2026-09-21T05:00:00Z") })).down, []); // stadig nede: ingen ny post
  up = true;
  assert.deepEqual((await checkAllSites(db, { probeFn, now: Date.parse("2026-09-22T05:00:00Z") })).recovered, ["VIDA"]);

  const acts = await db.select({ summary: activity.summary }).from(activity).where(eq(activity.companyId, kunde.id));
  assert.equal(acts.length, 2);
  const [s] = await db.select({ health: site.health }).from(site).where(eq(site.companyId, kunde.id));
  assert.equal((s.health as SiteHealth).ok, true);
});
