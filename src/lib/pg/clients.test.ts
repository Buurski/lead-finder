import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { freshTestDb } from "../db/test-db.ts";
import { company, deal } from "../db/schema.ts";
import type { Db } from "../db/client.ts";
import type { Lead } from "../sheets.ts";
import {
  addClient,
  addClientManual,
  getClients,
  markBriefFilled,
  removeClient,
  updateClientDeal,
  updateClientFees,
  updateClientFolder,
} from "./clients.ts";
import { appendLeads, getLeads } from "./leads.ts";

let db: Db;
beforeEach(async () => {
  db = await freshTestDb();
});

test("addClientManual + getClients roundtripper en fuld Client-form", async () => {
  await addClientManual({ name: "Kinly", branch: "HQ", phone: "123", monthlyFee: "500", setupFee: "1000" });
  const [c] = await getClients();
  assert.deepEqual(c, {
    id: "2",
    name: "Kinly",
    branch: "HQ",
    phone: "123",
    briefFilled: false,
    projectFolder: "",
    websiteStatus: "demo",
    monthlyFee: "500",
    setupFee: "1000",
    stage: "",
    wonDate: "",
    expectedClose: "",
    source: "",
    owner: "",
    package: "",
    lostDate: "",
  });
});

test("addClientManual skaber uafhængige clientNo-numre for flere kunder", async () => {
  await addClientManual({ name: "A" });
  await addClientManual({ name: "B" });
  const clients = await getClients();
  assert.deepEqual(clients.map((c) => c.id), ["2", "3"]);
});

test("updateClientDeal patcher kun de angivne felter, resten står urørt", async () => {
  await addClientManual({ name: "Kinly", monthlyFee: "500", setupFee: "1000" });
  const [c] = await getClients();
  await updateClientDeal(c.id, { stage: "won", wonDate: "2026-09-22", owner: "lucas" });
  const [after] = await getClients();
  assert.equal(after.stage, "won");
  assert.equal(after.wonDate, "2026-09-22");
  assert.equal(after.owner, "lucas");
  assert.equal(after.monthlyFee, "500"); // urørt af updateClientDeal
  assert.equal((await db.select().from(deal)).length, 1); // patch opdaterer, opretter ikke en ny deal
});

test("updateClientFees rører kun fee-felterne, ikke websiteStatus/projectFolder", async () => {
  await addClientManual({ name: "Kinly" });
  const [c] = await getClients();
  await updateClientFolder(0, "/mappe");
  await updateClientFees(c.id, "600", "1200");
  const [after] = await getClients();
  assert.equal(after.monthlyFee, "600");
  assert.equal(after.setupFee, "1200");
  assert.equal(after.projectFolder, "/mappe"); // updateClientFees clobrer ikke site-rækken
  assert.equal(after.websiteStatus, "demo");
});

test("updateClientFolder og markBriefFilled", async () => {
  await addClientManual({ name: "Kinly" });
  await updateClientFolder(0, "/kunder/kinly");
  await markBriefFilled(0);
  const [c] = await getClients();
  assert.equal(c.projectFolder, "/kunder/kinly");
  assert.equal(c.briefFilled, true);
});

test("removeClient matcher via canonicalClientName og unlinker uden at slette rækken", async () => {
  await addClientManual({ name: "VIDA Skønhedsklinik" });
  assert.deepEqual(await removeClient("Vida"), { removed: true }); // "Vida" -> alias -> "VIDA Skønhedsklinik"
  assert.deepEqual(await removeClient("ukendt navn"), { removed: false });
  const [row] = await db.select().from(company);
  assert.equal(row.clientNo, null);
  assert.equal(row.lifecycle, "tabt");
  assert.deepEqual(await getClients(), []); // ikke længere kunde
});

test("addClient genbruger lead-virksomheden (row_no) og sætter clientNo = max+1", async () => {
  const lead: Omit<Lead, "id"> = {
    name: "Ny Kunde", branch: "salon", phone: "111", city: "Herning", score: 80, source: "scrape",
    website: "", websiteStatus: "none", status: "interested", notes: "", lastUpdated: "",
    websiteQualityTier: "", enrichedInfo: "", email: "", emailSentAt: "", emailOpenedAt: "",
    emailClickedAt: "", emailStatus: "", followupSentAt: "", reviewsCount: 5, callbackDate: "",
    skipReason: "",
  };
  await appendLeads([lead]);
  const [l] = await getLeads();
  await addClient(l);

  const [c] = await getClients();
  assert.equal(c.name, "Ny Kunde");
  const [companyRow] = await db.select().from(company);
  assert.equal(companyRow.rowNo, 2); // samme row_no som leadet — ikke en ny virksomhed
  assert.equal(companyRow.clientNo, 2);
  assert.equal(companyRow.lifecycle, "kunde");
});
