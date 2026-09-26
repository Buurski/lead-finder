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

// --- Auto-link i brødteksten (regression 27-09) -----------------------------
// Bug: paragraphs() tog al tegnsætning, ubalancerede klammer og efterfølgende
// HTML-entiteter med ind i href, så "https://demo.dk/p." blev et dødt link og
// "https://demo.dk/p&gt;" efterlod et løst semikolon ude i teksten.

const body = (b: string) => renderSeoReportHtml({ ...input, body: b });
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
const rx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("rapport-mail: afsluttende tegnsætning hører til sætningen, ikke href", () => {
  for (const t of [".", ",", ";", ":", "!", "?", "—"]) {
    const html = body(`Læs mere på https://demo.dk/p${t} Vi har rettet det.`);
    assert.match(html, new RegExp(`href="https://demo\\.dk/p" style="color:#a63b05;">https://demo\\.dk/p</a>${rx(t)} `), `tegn: ${t}`);
    assert.ok(!hrefs(html).includes(`https://demo.dk/p${t}`), `href sluge ${t}`);
  }
  const slashDot = body("Se https://demo.dk/side/. Her er resten.");
  assert.match(slashDot, /href="https:\/\/demo\.dk\/side\/" style="color:#a63b05;">https:\/\/demo\.dk\/side\/<\/a>\. Her er resten\./);
});

// Em dash er U+2014 (—), ikke ASCII-bindestreg (-) og ikke tankestreg U+2013.
// Kilder skrevet med em dash må ikke få tegnet trukket ind i href.
test("rapport-mail: em dash (U+2014) efterlader href uden tegnet og viser det efter </a>", () => {
  assert.equal("—".codePointAt(0), 0x2014);

  const kinlyDot = body("Se https://kinly.dk/. Her er resten.");
  assert.ok(hrefs(kinlyDot).includes("https://kinly.dk/"), "href skal være præcis https://kinly.dk/");
  assert.ok(!hrefs(kinlyDot).includes("https://kinly.dk/."), "punktum må ikke i href");
  assert.match(
    kinlyDot,
    /href="https:\/\/kinly\.dk\/" style="color:#a63b05;">https:\/\/kinly\.dk\/<\/a>\. Her er resten\./,
  );

  const kinlyDash = body("Se https://kinly.dk— så er vi i gang.");
  assert.ok(hrefs(kinlyDash).includes("https://kinly.dk"), "href skal være præcis https://kinly.dk");
  assert.ok(!hrefs(kinlyDash).includes("https://kinly.dk—"), "em dash må ikke i href");
  assert.match(
    kinlyDash,
    /href="https:\/\/kinly\.dk" style="color:#a63b05;">https:\/\/kinly\.dk<\/a>— så er vi i gang\./,
  );

  for (const [html, tail] of [
    [kinlyDot, "."],
    [kinlyDash, "—"],
  ] as [string, string][]) {
    assert.match(html, new RegExp(`</a>${rx(tail)}`), `synligt tegn efter </a>: ${tail}`);
    assert.doesNotMatch(html, new RegExp(`</a>${rx(tail)}\\s*</p>$|[^<]${rx(tail)}</a>`), "tegn må ikke stå før </a> eller forsvinde");
  }
});

test("rapport-mail: afsluttende HTML-entiteter rives ikke over (intet løst semikolon)", () => {
  // Kilden rå: > & " bliver &gt; &amp; &quot; i den escaped tekst. Kilden
  // skrevet som entitet bliver dobbelt-escaped (&amp;gt;), og skal stadig ud i
  // ét stykke som synlig tekst.
  const cases: [string, string][] = [
    ["Se https://demo.dk/p> her", "&gt;"],
    ["Se https://demo.dk/p& her", "&amp;"],
    ["Se https://demo.dk/p&quot; her", "&amp;quot;"],
    ["Se https://demo.dk/p&gt; her", "&amp;gt;"],
    ["Se https://demo.dk/p&amp; her", "&amp;amp;"],
  ];
  for (const [b, tail] of cases) {
    const html = body(b);
    assert.match(html, new RegExp(`href="https://demo\\.dk/p" style="color:#a63b05;">https://demo\\.dk/p</a>${rx(tail)} her`), b);
    assert.doesNotMatch(html, /<\/a>;/, b);
  }
  assert.ok(hrefs(body("Se https://demo.dk/p&amp; her")).every((h) => !/[&;]$/.test(h)));
});

test("rapport-mail: path, query, fragment og case bevares i href og linktekst", () => {
  const html = body("Se https://Demo.DK/Sti/Side?a=1&b=2#Anker her");
  assert.ok(hrefs(html).includes("https://Demo.DK/Sti/Side?a=1&amp;b=2#Anker"));
  assert.match(html, />https:\/\/Demo\.DK\/Sti\/Side\?a=1&amp;b=2#Anker<\/a>/);
  const upper = body("Se HTTPS://demo.dk/P her");
  assert.ok(hrefs(upper).includes("HTTPS://demo.dk/P"));
});

test("rapport-mail: balancerede klammer bliver i adressen, ubalancerede ryger ud", () => {
  const bal = body("Læs https://demo.dk/wiki/Foo_(bar) her");
  assert.ok(hrefs(bal).includes("https://demo.dk/wiki/Foo_(bar)"));
  assert.match(bal, /<\/a> her/);
  const unbal = body("(https://demo.dk/p)");
  assert.ok(hrefs(unbal).includes("https://demo.dk/p"));
  assert.match(unbal, /href="https:\/\/demo\.dk\/p" style="color:#a63b05;">https:\/\/demo\.dk\/p<\/a>\)/);
});

test("rapport-mail: rå citationstegn kan ikke bryde ud af href", () => {
  const html = body(
    `Se "https://demo.dk/p?x=1" og 'https://demo.dk/q' samt https://demo.dk/r"onmouseover="alert(1) og https://demo.dk/s'onmouseover='alert(1)`,
  );
  for (const want of ["https://demo.dk/p?x=1", "https://demo.dk/q", "https://demo.dk/r", "https://demo.dk/s"]) {
    assert.ok(hrefs(html).includes(want), `mangler ren href: ${want}`);
  }
  for (const h of hrefs(html)) assert.match(h, /^https?:\/\/[^\s"'<>]*$/i, `usikker href: ${h}`);
  assert.doesNotMatch(html, /<a [^>]*onmouseover/);
});
