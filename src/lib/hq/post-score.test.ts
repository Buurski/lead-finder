import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { createPost, readScores, SCORE_AXES } from "./posts.ts";
import { assessPost, parseJevScores, SCORE_QUESTIONS } from "./post-score.ts";

let db: Db;
beforeEach(async () => {
  db = await freshTestDb();
  delete process.env.TYPESAFE_API_KEY;
  delete process.env.JEV_DISABLED;
});

test("SCORE_QUESTIONS dækker præcis de seks akser, alle som noul", () => {
  assert.deepEqual(Object.keys(SCORE_QUESTIONS).sort(), [...SCORE_AXES].sort());
  for (const q of Object.values(SCORE_QUESTIONS)) assert.equal(q.type, "noul");
});

test("parseJevScores: gyldigt svar skaleres 0-1 → 1-100 med tom begrundelse", () => {
  const answers = Object.fromEntries(SCORE_AXES.map((a, i) => [a, { type: "noul" as const, noul: i / (SCORE_AXES.length - 1) }]));
  const parsed = parseJevScores(answers);
  assert.ok(parsed);
  for (const axis of SCORE_AXES) {
    assert.equal(parsed![axis].why, "");
    assert.ok(parsed![axis].score >= 1 && parsed![axis].score <= 100);
  }
});

test("parseJevScores: manglende akse er en fejl, ikke en nul-score", () => {
  const answers = Object.fromEntries(
    SCORE_AXES.filter((a) => a !== "gap").map((a) => [a, { type: "noul" as const, noul: 0.7 }]),
  );
  assert.equal(parseJevScores(answers), null);
});

test("parseJevScores: ude af 0-1-området er en fejl, ikke en nul-score", () => {
  const bad = Object.fromEntries(SCORE_AXES.map((a) => [a, { type: "noul" as const, noul: 1.4 }]));
  assert.equal(parseJevScores(bad), null);
});

test("parseJevScores: forkert svartype på én akse er en fejl", () => {
  const answers: Record<string, unknown> = Object.fromEntries(SCORE_AXES.map((a) => [a, { type: "noul" as const, noul: 0.5 }]));
  answers.seo = { type: "choice", choice: "x", confidence: 0.9, probabilities: {} };
  assert.equal(parseJevScores(answers as never), null);
});

test("assessPost: uden TYPESAFE_API_KEY returnerer null uden at røre posten", async () => {
  const post = await createPost(db, { title: "Ubedømt idé", category: "pris", note: "test" }, "hermes");
  const result = await assessPost(db, post.id, { title: post.title, category: post.category, note: post.note });
  assert.equal(result, null);
  assert.deepEqual(readScores(post.scores), {});
});
