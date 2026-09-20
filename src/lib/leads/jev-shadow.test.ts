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
  assert.equal(r.attractiveness, 32);
  assert.ok(!r.reasons.some((x) => x.includes("kæde")));
});
