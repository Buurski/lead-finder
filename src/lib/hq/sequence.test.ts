import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { company, outreach } from "../db/schema.ts";
import { composeStep, createFollowUpDrafts, followUpCandidates, nextAngle, stopOpenDrafts, type Angle } from "./sequence.ts";
import type { QueueDraft } from "../queue.ts";

let db: Db;
beforeEach(async () => {
  process.env.DATA_BACKEND = "pg";
  db = await freshTestDb();
});

const TODAY = "2026-09-22";

test("alle vinkler består stemme-reglerne og nævner virksomheden", () => {
  for (const a of ["gratis_udkast", "seo_tjek", "eksempel", "sidste"] as Angle[]) {
    const m = composeStep({ name: "Salon Artec", branch: "frisør", website: "salonartec.dk" }, a);
    assert.match(m.body, /^Hej Salon Artec,/);
    assert.match(m.subject, /^Re: /);
  }
});

test("vinkel: aldrig samme to gange, sidste trin er altid 'sidste', ingen SEO uden hjemmeside", () => {
  assert.equal(nextAngle(2, 3, [], true), "gratis_udkast");
  assert.equal(nextAngle(3, 5, ["gratis_udkast"], true), "seo_tjek");
  assert.equal(nextAngle(3, 5, ["gratis_udkast"], false), "eksempel");
  assert.equal(nextAngle(3, 3, [], true), "sidste");
});

async function sentLead(rowNo: number, sentAt: string, extra: Partial<typeof company.$inferInsert> = {}) {
  await db.insert(company).values({ rowNo, name: `Lead ${rowNo}`, email: `l${rowNo}@x.dk`, emailSentAt: sentAt.slice(0, 10), ...extra });
  await db.insert(outreach).values({ id: `d${rowNo}`, companyRowNo: rowNo, status: "sent", sentBy: "charlie", draft: { id: `d${rowNo}`, leadId: String(rowNo), status: "sent", sentBy: "charlie", updatedAt: sentAt }, updatedAt: sentAt });
}

test("kun modne, ubesvarede leads uden åben kladde bliver kandidater", async () => {
  await sentLead(2, "2026-09-15T10:00:00Z"); // 7 dage → moden til trin 2
  await sentLead(3, "2026-09-20T10:00:00Z"); // 2 dage → ikke moden
  await sentLead(4, "2026-09-10T10:00:00Z", { emailStatus: "replied" }); // svaret
  await sentLead(5, "2026-09-10T10:00:00Z", { leadStatus: "not-interested" }); // nej tak
  await sentLead(6, "2026-09-10T10:00:00Z");
  await db.insert(outreach).values({ id: "open6", companyRowNo: 6, status: "pending", draft: { id: "open6", leadId: "6", status: "pending" } }); // kladde venter
  const c = await followUpCandidates(db, TODAY);
  assert.deepEqual(c.map((x) => [x.rowNo, x.step, x.angle, x.sender]), [[2, 2, "gratis_udkast", "charlie"]]);
});

test("loftet på antal mails respekteres (standard 3, pr. lead op til 5)", async () => {
  await sentLead(2, "2026-09-01T10:00:00Z", { website: "lead2.dk" });
  await db.insert(outreach).values([
    { id: "b2", companyRowNo: 2, status: "sent", angle: "gratis_udkast", draft: {}, updatedAt: "2026-09-05T10:00:00Z" },
    { id: "c2", companyRowNo: 2, status: "sent", angle: "sidste", draft: {}, updatedAt: "2026-09-12T10:00:00Z" },
  ]);
  assert.equal((await followUpCandidates(db, TODAY)).length, 0); // 3 sendt = færdig
  const { eq } = await import("drizzle-orm");
  await db.update(company).set({ maxTouches: 5 }).where(eq(company.rowNo, 2));
  const [c] = await followUpCandidates(db, TODAY);
  assert.deepEqual([c.step, c.angle], [4, "seo_tjek"]);
});

test("opfølgninger lægges i køen som kladder med trin og vinkel — og kun én gang", async () => {
  await sentLead(2, "2026-09-15T10:00:00Z");
  assert.deepEqual(await createFollowUpDrafts(db, TODAY), { created: 1, candidates: 1 });
  const rows = await db.select().from(outreach);
  const f = rows.find((r) => r.status === "pending")!;
  assert.equal(f.step, 2);
  assert.equal(f.angle, "gratis_udkast");
  assert.equal((f.draft as QueueDraft).source, "opfoelgning");
  assert.deepEqual(await createFollowUpDrafts(db, TODAY), { created: 0, candidates: 0 }); // åben kladde spærrer
});

test("svar stopper åbne kladder for det lead og kun det", () => {
  const q = [
    { id: "a", leadId: "5", status: "pending" },
    { id: "b", leadId: "5", status: "sent" },
    { id: "c", leadId: "6", status: "approved" },
  ] as QueueDraft[];
  assert.equal(stopOpenDrafts(q, "5", "svar modtaget", "2026-09-22T00:00:00Z"), 1);
  assert.deepEqual(q.map((d) => d.status), ["rejected", "sent", "approved"]);
  assert.equal(q[0].stoppedReason, "svar modtaget");
});
