import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPage, isSafeUrl, redact } from "./fetch-page.ts";
import { toJudgment } from "./leads/site-judgments.ts";

test("redact removes emails, CPR numbers and Danish phones", () => {
  const s = redact("Skriv til kim@firma.dk eller ring 23 24 24 82. CPR 010190-1234 og 0101901234.");
  assert.ok(!s.includes("kim@firma.dk"));
  assert.ok(!s.includes("010190-1234"));
  assert.ok(!s.includes("0101901234"));
  assert.ok(!s.includes("23 24 24 82"));
  assert.ok(s.includes("[mail]") && s.includes("[cpr]") && s.includes("[tlf]"));
});

test("extractPage redacts title and generator too, not only body text", () => {
  const html = `<html><head><title>Klinik – ring 23 24 24 82 – kim@k.dk</title><meta name="generator" content="WP kim@k.dk"></head><body><p>Hej</p></body></html>`;
  const p = extractPage("https://k.dk/", html);
  assert.ok(!p.title.includes("@") && !p.title.includes("23 24 24 82"));
  assert.ok(!p.generator.includes("@"));
});

test("isSafeUrl accepts public http(s) and rejects private/loopback/schemes", () => {
  assert.equal(isSafeUrl("https://kinly.dk/"), true);
  assert.equal(isSafeUrl("http://www.ktvvs.dk"), true);
  assert.equal(isSafeUrl("http://127.0.0.1/"), false);
  assert.equal(isSafeUrl("http://10.0.0.5/"), false);
  assert.equal(isSafeUrl("http://172.20.1.1/"), false);
  assert.equal(isSafeUrl("http://192.168.1.1/"), false);
  assert.equal(isSafeUrl("http://169.254.169.254/latest/meta-data"), false);
  assert.equal(isSafeUrl("http://localhost:3000/"), false);
  assert.equal(isSafeUrl("http://[::1]/"), false);
  assert.equal(isSafeUrl("ftp://kinly.dk/"), false);
  assert.equal(isSafeUrl("http://user:pw@kinly.dk/"), false);
  assert.equal(isSafeUrl("not a url"), false);
});

test("toJudgment rejects out-of-range or unknown answers", () => {
  const ok = {
    redesign: { type: "score" as const, score: 2.2, confidence: 0.9, probabilities: {} },
    cta: { type: "score" as const, score: 1, confidence: 0.9, probabilities: {} },
    lokal: { type: "noul" as const, noul: 0.95 },
    dateret_sprog: { type: "noul" as const, noul: 0.6 },
    online_booking: { type: "noul" as const, noul: 0.05 },
    eeat: { type: "choice" as const, choice: "fuld", confidence: 0.8, probabilities: {} },
    budget_signal: { type: "choice" as const, choice: "hoejt", confidence: 0.6, probabilities: {} },
  };
  assert.ok(toJudgment(ok));
  assert.equal(toJudgment({ ...ok, redesign: { ...ok.redesign, score: 4.5 } }), null);
  assert.equal(toJudgment({ ...ok, lokal: { type: "noul", noul: 1.7 } }), null);
  assert.equal(toJudgment({ ...ok, eeat: { ...ok.eeat, choice: "whatever" } }), null);
  assert.equal(toJudgment({ ...ok, budget_signal: { ...ok.budget_signal, choice: "premium" } }), null);
});
