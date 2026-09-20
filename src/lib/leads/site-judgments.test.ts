import { test } from "node:test";
import assert from "node:assert/strict";
import { attractiveness, toJudgment, type SiteJudgment } from "./site-judgments.ts";
import { jevAsk } from "../jev.ts";

const base: SiteJudgment = {
  redesign: 2.5,
  cta: 1,
  lokal: 0.9,
  dateretSprog: 0.7,
  onlineBooking: 0.1,
  eeat: "kontakt",
  eeatConfidence: 0.8,
  budget: "middel",
  budgetConfidence: 0.7,
};

test("old site, middle budget, no booking, dated → high attractiveness", () => {
  const r = attractiveness(base, false);
  // 50 (redesign) + 10 (no booking) + 10 (dated) = 70
  assert.equal(r.score, 70);
  assert.ok(r.reasons.some((x) => x.includes("ingen online booking")));
});

test("chain penalty dominates even for an old site", () => {
  const r = attractiveness(base, true);
  assert.equal(r.score, 30);
  assert.ok(r.reasons.some((x) => x.includes("kæde")));
});

test("already modern site is unattractive", () => {
  const r = attractiveness({ ...base, redesign: 0.4, dateretSprog: 0.1, onlineBooking: 0.9 }, false);
  // 8 (redesign) − 30 (modern) → clamp 0
  assert.equal(r.score, 0);
});

test("low budget signal subtracts, high adds", () => {
  const low = attractiveness({ ...base, budget: "lavt" }, false).score;
  const high = attractiveness({ ...base, budget: "hoejt" }, false).score;
  assert.equal(high - low, 35);
});

test("toJudgment returns null when an answer is missing", () => {
  assert.equal(toJudgment(undefined), null);
  assert.equal(toJudgment({ redesign: { type: "score", score: 2, confidence: 0.9, probabilities: {} } }), null);
});

test("toJudgment maps a full answer set", () => {
  const j = toJudgment({
    redesign: { type: "score", score: 2.2, confidence: 0.9, probabilities: {} },
    cta: { type: "score", score: 1, confidence: 0.9, probabilities: {} },
    lokal: { type: "noul", noul: 0.95 },
    dateret_sprog: { type: "noul", noul: 0.6 },
    online_booking: { type: "noul", noul: 0.05 },
    eeat: { type: "choice", choice: "fuld", confidence: 0.8, probabilities: {} },
    budget_signal: { type: "choice", choice: "hoejt", confidence: 0.6, probabilities: {} },
  });
  assert.ok(j);
  assert.equal(j?.budget, "hoejt");
  assert.equal(j?.eeat, "fuld");
});

test("jevAsk returns null without a key and makes no network call", async () => {
  const saved = process.env.TYPESAFE_API_KEY;
  delete process.env.TYPESAFE_API_KEY;
  try {
    const r = await jevAsk({ x: 1 }, { q: { type: "noul", instructions: "?" } });
    assert.equal(r, null);
  } finally {
    if (saved) process.env.TYPESAFE_API_KEY = saved;
  }
});
