import { test } from "node:test";
import assert from "node:assert/strict";
import { draftQuality, toDraftJudgment, type DraftJudgment } from "./draft-judgments.ts";

const perfect: DraftJudgment = {
  demoMatcherBranche: 0.9,
  konkretObservation: 0.8,
  lyderSomLucas: 3,
  naevnerPris: 0.05,
  fejlIFakta: 0.02,
  emneAppel: 3,
};

test("perfect draft scores high, no flags", () => {
  const r = draftQuality(perfect);
  // 50 + 20 + 15 + 30 + 15 = 130 → clamp 100
  assert.equal(r.score, 100);
  assert.deepEqual(r.flags, []);
});

test("price mention tanks the score and flags it", () => {
  const r = draftQuality({ ...perfect, naevnerPris: 0.7 });
  // 130 − 40 = 90
  assert.equal(r.score, 90);
  assert.ok(r.flags.includes("nævner pris"));
});

test("fact error tanks the score, flags it, and triggers send ikke", () => {
  const r = draftQuality({ ...perfect, fejlIFakta: 0.9, lyderSomLucas: 0, demoMatcherBranche: 0.1, konkretObservation: 0.1, emneAppel: 0 });
  // 50 − 20 − 10 + 0 − 50 + 0 = −30 → clamp 0
  assert.equal(r.score, 0);
  assert.ok(r.flags.includes("faktafejl"));
  assert.ok(r.flags.includes("send ikke"));
});

test("generic draft (weak demo match + no concrete observation) scores low", () => {
  const r = draftQuality({
    demoMatcherBranche: 0.2,
    konkretObservation: 0.1,
    lyderSomLucas: 1,
    naevnerPris: 0.02,
    fejlIFakta: 0.02,
    emneAppel: 1,
  });
  // 50 − 20 − 10 + 10 + 5 = 35 → send ikke
  assert.equal(r.score, 35);
  assert.ok(r.flags.includes("send ikke"));
});

test("toDraftJudgment returns null when an answer is missing", () => {
  assert.equal(toDraftJudgment(undefined), null);
  assert.equal(
    toDraftJudgment({ demo_matcher_branche: { type: "noul", noul: 0.5 } }),
    null,
  );
});

test("toDraftJudgment maps a full answer set", () => {
  const j = toDraftJudgment({
    demo_matcher_branche: { type: "noul", noul: 0.8 },
    konkret_observation: { type: "noul", noul: 0.7 },
    lyder_som_lucas: { type: "score", score: 3, confidence: 0.9, probabilities: {} },
    naevner_pris: { type: "noul", noul: 0.01 },
    fejl_i_fakta: { type: "noul", noul: 0.01 },
    emne_appel: { type: "score", score: 2, confidence: 0.8, probabilities: {} },
  });
  assert.ok(j);
  assert.equal(j?.lyderSomLucas, 3);
  assert.equal(j?.emneAppel, 2);
});
