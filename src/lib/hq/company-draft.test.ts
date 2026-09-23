import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATA_BACKEND = "pg";
const { freshTestDb } = await import("../db/test-db.ts");
const { company } = await import("../db/schema.ts");
const { draftForCompany } = await import("./company-draft.ts");
const { readQueue, updateDraft } = await import("../queue.ts");

async function seed(over: Record<string, unknown>) {
  const db = await freshTestDb();
  const [c] = await db.insert(company).values({ rowNo: -5, name: "Kagehuset", branch: "café", city: "Herning", email: "kontakt@kagehuset.dk", ...over }).returning();
  return { db, c };
}

test("draftForCompany: CRM-oprettet lead (negativt row_no) lander i godkendelsen med modtager", async () => {
  const { db, c } = await seed({});
  const { draftId } = await draftForCompany(db, c.id, "charlie", new Date("2026-09-23T10:00:00Z"));
  const d = (await readQueue()).find((x) => x.id === draftId)!;
  assert.equal(d.status, "pending");
  assert.equal(d.recipientEmail, "kontakt@kagehuset.dk");
  assert.equal(d.sender, "charlie");
  assert.ok(!/salgselev|Jeg hedder Lucas/i.test(d.body));
});

test("draftForCompany: afviser uden mail, kunder og allerede kontaktede", async () => {
  let s = await seed({ email: "" });
  await assert.rejects(draftForCompany(s.db, s.c.id, "lucas"), /mailadresse/);
  s = await seed({ clientNo: 9 });
  await assert.rejects(draftForCompany(s.db, s.c.id, "lucas"), /kunde/);
  s = await seed({ emailSentAt: "2026-09-01T08:00:00Z" });
  await assert.rejects(draftForCompany(s.db, s.c.id, "lucas"), /allerede sendt/);
});

test("draftForCompany: anden kladde til samme virksomhed afvises", async () => {
  const { db, c } = await seed({});
  const { draftId } = await draftForCompany(db, c.id, "lucas");
  await assert.rejects(draftForCompany(db, c.id, "lucas"), /allerede en åben/);
  await updateDraft(draftId, { status: "approved" });
  await assert.rejects(draftForCompany(db, c.id, "lucas"), /godkendt eller sendt/);
});
