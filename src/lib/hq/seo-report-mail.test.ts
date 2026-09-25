import { test } from "node:test";
import assert from "node:assert/strict";
import { renderSeoReportHtml, renderSeoReportText, scoreLabel } from "./seo-report-mail.ts";

const input = {
  body: "Hej Maja\n\nTak fordi du tjekkede siden. Her er det vigtigste.",
  seoTjek: { host: "frisor.dk", score: 41, mangler: ["Meta-beskrivelse <script>", "llms.txt", "Åbningstider i schema"] },
  signatureHtml: "<p>Lucas</p>",
  signatureText: "Lucas",
  now: new Date("2026-09-25T10:00:00Z"),
};

test("rapport-mail: tal, huller (escaped), tilbud uden frist, CTA og signatur", () => {
  const html = renderSeoReportHtml(input);
  assert.match(html, /41<\/span>/);
  assert.match(html, /frisor\.dk/);
  assert.match(html, /Meta-beskrivelse &lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /10 % på den første opgave/);
  assert.doesNotMatch(html, /frist|Gælder til/i);
  assert.match(html, /kinly\.dk\/kontakt\/\?ref=seo-rapport/);
  assert.match(html, /<p>Lucas<\/p>/);
  assert.match(html, /Hej Maja<\/p>/);
  const text = renderSeoReportText(input);
  assert.match(text, /41\/100/);
  assert.match(text, /1\. Meta-beskrivelse/);
  assert.doesNotMatch(text, /frist|gælder til/i);
});

test("scoreLabel", () => {
  assert.equal(scoreLabel(85), "Godt fundament");
  assert.equal(scoreLabel(60), "Tæt på, men med huller");
  assert.equal(scoreLabel(20), "Kunder har svært ved at finde jer");
});
