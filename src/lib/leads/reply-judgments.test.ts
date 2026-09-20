import { test } from "node:test";
import assert from "node:assert/strict";
import { toReplyJudgment } from "./reply-judgments.ts";
import type { JevAnswers } from "../jev.ts";

test("toReplyJudgment returns null on missing answers", () => {
  assert.equal(toReplyJudgment(undefined), null);
  assert.equal(toReplyJudgment({}), null);
});

test("toReplyJudgment returns null when the choice isn't a declared key", () => {
  const answers: JevAnswers = {
    naeste_skridt: { type: "choice", choice: "gør_ingenting", confidence: 0.9, probabilities: {} },
    haster: { type: "score", score: 1, confidence: 0.8, probabilities: {} },
    varme: { type: "score", score: 1, confidence: 0.8, probabilities: {} },
    spoergsmaal_der_skal_besvares: { type: "noul", noul: 0 },
  };
  assert.equal(toReplyJudgment(answers), null);
});

test("toReplyJudgment returns null when a score is out of range", () => {
  const answers: JevAnswers = {
    naeste_skridt: { type: "choice", choice: "ring_i_dag", confidence: 0.9, probabilities: {} },
    haster: { type: "score", score: 5, confidence: 0.8, probabilities: {} },
    varme: { type: "score", score: 1, confidence: 0.8, probabilities: {} },
    spoergsmaal_der_skal_besvares: { type: "noul", noul: 0 },
  };
  assert.equal(toReplyJudgment(answers), null);
});

test("toReplyJudgment parses a full valid answer set", () => {
  const answers: JevAnswers = {
    naeste_skridt: { type: "choice", choice: "send_udkast_eller_pris", confidence: 0.82, probabilities: {} },
    haster: { type: "score", score: 2, confidence: 0.7, probabilities: {} },
    varme: { type: "score", score: 3, confidence: 0.75, probabilities: {} },
    spoergsmaal_der_skal_besvares: { type: "noul", noul: 1 },
  };
  const j = toReplyJudgment(answers);
  assert.ok(j);
  assert.equal(j.action, "send_udkast_eller_pris");
  assert.equal(j.actionConfidence, 0.82);
  assert.equal(j.haster, 2);
  assert.equal(j.varme, 3);
  assert.equal(j.spoergsmaal, 1);
});
