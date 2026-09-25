import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { activity, company, contact } from "../db/schema.ts";
import { recordInbound } from "./inbound.ts";

let db: Db;
beforeEach(async () => {
  db = await freshTestDb();
  await db.insert(company).values([
    { rowNo: 5, name: "Salon Lux", email: "hej@salonlux.dk", website: "https://www.salonlux.dk/", leadStatus: "new" },
    { rowNo: -1, name: "KT VVS", clientNo: 1, email: "info@ktvvs.dk", leadStatus: "client" },
  ]);
});

const base = { channel: "formular", questionnaire: "Vi vil gerne have en ny side" };

test("kendt lead findes på website, bliver interesseret og får kontakt + aktivitet én gang", async () => {
  const input = { ...base, id: "p1", company: "Lux", email: "maja@gmail.com", contactName: "Maja", website: "salonlux.dk" };
  const r = await recordInbound(db, input);
  assert.equal(r.created, false);
  assert.equal(r.rowNo, 5);
  const [c] = await db.select().from(company).where(eq(company.id, r.companyId));
  assert.equal(c.leadStatus, "interested");
  assert.equal(c.lifecycle, "interesseret");
  assert.equal((await db.select().from(contact)).length, 1);
  const again = await recordInbound(db, input);
  assert.equal(again.duplicate, true);
  assert.equal((await db.select().from(activity)).length, 1);
});

test("kunde forbliver kunde; ukendt opretter ny virksomhed med rækkenummer", async () => {
  const k = await recordInbound(db, { ...base, id: "p2", company: "KT VVS", email: "INFO@ktvvs.dk" });
  const [kt] = await db.select().from(company).where(eq(company.id, k.companyId));
  assert.equal(kt.leadStatus, "client");
  const n = await recordInbound(db, { ...base, id: "p3", company: "Ny Frisør", email: "ny@frisor.dk" });
  assert.equal(n.created, true);
  assert.equal(n.rowNo, 6);
  const [ny] = await db.select().from(company).where(eq(company.id, n.companyId));
  assert.equal(ny.source, "kinly.dk");
  assert.equal(ny.lifecycle, "interesseret");
});

test("delt mail hæfter ikke en anden forretning på det gamle lead", async () => {
  const r = await recordInbound(db, { ...base, id: "p4", company: "Maja Negle", email: "hej@salonlux.dk", website: "majanegle.dk" });
  assert.equal(r.created, true);
  const same = await recordInbound(db, { ...base, id: "p5", company: "Salon Lux ApS", email: "hej@salonlux.dk" });
  assert.equal(same.rowNo, 5);
});

test("SEO-tjek-henvendelse: telefon lander på ny virksomhed og kontakt; et kendt nummer overskrives aldrig", async () => {
  const n = await recordInbound(db, { ...base, id: "p9", company: "frisor.dk", email: "ejer@frisor.dk", website: "https://frisor.dk", phone: "+45 23 24 24 82" });
  const [c] = await db.select().from(company).where(eq(company.id, n.companyId));
  assert.equal(c.phone, "+45 23 24 24 82");
  assert.equal(c.website, "https://frisor.dk");
  const [k] = await db.select().from(contact).where(eq(contact.companyId, n.companyId));
  assert.equal(k.phone, "+45 23 24 24 82");

  await db.update(company).set({ phone: "11 22 33 44" }).where(eq(company.name, "Salon Lux"));
  const r = await recordInbound(db, { ...base, id: "p10", company: "Lux", email: "maja@gmail.com", website: "salonlux.dk", phone: "99 88 77 66" });
  const [lux] = await db.select().from(company).where(eq(company.id, r.companyId));
  assert.equal(lux.phone, "11 22 33 44");
});

test("ubekræftet nummer lægges aldrig på en eksisterende virksomhed uden nummer — kun på henvendelsen (Sol R7-04)", async () => {
  await db.update(company).set({ phone: "" }).where(eq(company.name, "Salon Lux"));
  const r = await recordInbound(db, { ...base, id: "p11", company: "Lux", email: "fremmed@gmail.com", website: "salonlux.dk", phone: "99 88 77 66" });
  const [lux] = await db.select().from(company).where(eq(company.id, r.companyId));
  assert.equal(lux.phone, "");
  const [a] = await db.select().from(activity).where(eq(activity.legacyId, "preview:p11"));
  assert.equal((a.payload as { phone?: string }).phone, "99 88 77 66");
});
