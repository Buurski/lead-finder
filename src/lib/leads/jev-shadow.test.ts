import { test } from "node:test";
import assert from "node:assert/strict";
import { pickBatch, type JevShadowRecord } from "./jev-shadow.ts";
import type { Lead } from "../sheets.ts";

function lead(id: string, overrides: Partial<Lead> = {}): Lead {
  return {
    id,
    name: `Lead ${id}`,
    branch: "restaurant",
    phone: "",
    city: "Herning",
    score: 50,
    source: "",
    website: "https://example.dk",
    websiteStatus: "ok",
    status: "new",
    notes: "",
    lastUpdated: "",
    websiteQualityTier: "old",
    enrichedInfo: "",
    email: "",
    emailSentAt: "",
    emailOpenedAt: "",
    emailClickedAt: "",
    emailStatus: "",
    followupSentAt: "",
    reviewsCount: 0,
    callbackDate: "",
    ...overrides,
  } as Lead;
}

function shadow(leadId: string, judgedAt: string): JevShadowRecord {
  return {
    leadId,
    name: "",
    city: "",
    branch: "",
    url: "",
    sheetScore: 0,
    sheetTier: "",
    sheetStatus: "",
    judgment: null,
    attractiveness: null,
    reasons: [],
    isChain: false,
    model: null,
    judgedAt,
    inputFingerprint: null,
  };
}

test("pickBatch filters out ineligible websiteStatus, missing website, and client/dead status", () => {
  const leads = [
    lead("1", { websiteStatus: "none" }),
    lead("2", { website: "" }),
    lead("3", { status: "client" }),
    lead("4", { status: "dead" as Lead["status"] }),
    lead("5"),
  ];
  const picked = pickBatch(leads, [], 10);
  assert.deepEqual(picked.map((l) => l.id), ["5"]);
});

test("pickBatch orders never-judged leads before judged ones, then oldest judgedAt first", () => {
  const leads = [lead("a"), lead("b"), lead("c")];
  const existing = [shadow("a", "2026-09-10T00:00:00Z"), shadow("c", "2026-09-01T00:00:00Z")];
  const picked = pickBatch(leads, existing, 10);
  // b never judged -> first. Then c (older judgedAt) before a (newer).
  assert.deepEqual(picked.map((l) => l.id), ["b", "c", "a"]);
});

test("pickBatch respects max", () => {
  const leads = [lead("1"), lead("2"), lead("3")];
  const picked = pickBatch(leads, [], 2);
  assert.equal(picked.length, 2);
});

test("rescore recomputes chain flag from name only and re-derives attractiveness", async () => {
  const { rescore } = await import("./jev-shadow.ts");
  const rec = {
    leadId: "x", name: "Meineche Frisør", city: "Ikast", branch: "Frisør", url: "https://x.dk", sheetScore: 63,
    sheetTier: "mediocre", sheetStatus: "skip", isChain: true, attractiveness: 0, reasons: ["kæde/franchise −40"],
    judgment: { redesign: 1.6, cta: 2, lokal: 0.9, dateretSprog: 0.3, onlineBooking: 0.9, eeat: "kontakt", eeatConfidence: 0.8, budget: "middel" as const, budgetConfidence: 0.7 },
    model: "jev", judgedAt: "2026-09-20T00:00:00Z", inputFingerprint: null,
  };
  const r = rescore(rec);
  assert.equal(r.isChain, false);
  // En post gemt FØR ICP-spørgsmålet fandtes har hverken lignerKunde eller
  // virksomhedstype. Den skal give et tal, ikke NaN — 0,5 = "ved det ikke".
  assert.ok(Number.isFinite(r.attractiveness), `fik ${r.attractiveness}`);
  assert.ok(!r.reasons.some((x) => x.includes("kæde")));
});

test("pickBatch: leads med en ventende kladde kommer først", () => {
  const mk = (id: string): Lead => ({
    id, name: `Firma ${id}`, branch: "Frisør", phone: "", city: "Herning", score: 50,
    source: "", website: `https://f${id}.dk`, websiteStatus: "ok", status: "new", notes: "",
    lastUpdated: "", websiteQualityTier: "old", enrichedInfo: "", email: "", emailSentAt: "",
    emailOpenedAt: "", emailClickedAt: "", emailStatus: "", followupSentAt: "", reviewsCount: 0,
    callbackDate: "",
  } as Lead);
  const leads = ["1", "2", "3", "4"].map(mk);
  // 1 og 2 er allerede vurderet; 4 har en ventende kladde.
  const existing = [
    { leadId: "1", judgedAt: "2026-09-01T00:00:00Z" },
    { leadId: "2", judgedAt: "2026-09-02T00:00:00Z" },
    { leadId: "4", judgedAt: "2026-09-03T00:00:00Z" },
  ] as JevShadowRecord[];
  const plain = pickBatch(leads, existing, 2).map((l) => l.id);
  assert.deepEqual(plain, ["3", "1"], "uden prioritering: aldrig-vurderet først, så ældst");
  // 4's dom er fra før ICP-spørgsmålet (ingen lignerKunde) → skal genvurderes først.
  const withDraft = pickBatch(leads, existing, 2, new Set(["4"])).map((l) => l.id);
  assert.equal(withDraft[0], "4", "kladde-lead med forældet dom springer køen over");
  // Med en aktuel dom springer det IKKE over — ellers genvurderes kladde-leads i ring.
  const current = existing.map((r) => (r.leadId === "4" ? { ...r, judgment: { lignerKunde: 0.7 } } : r)) as JevShadowRecord[];
  const covered = pickBatch(leads, current, 2, new Set(["4"])).map((l) => l.id);
  assert.deepEqual(covered, ["3", "1"], "dækket kladde-lead: normal rækkefølge");
});
