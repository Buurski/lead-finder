import { test } from "node:test";
import assert from "node:assert/strict";
import { isOptOut, isRejection, wantsContact } from "./rejections.ts";
import { decodeMailBody } from "./mail-decode.ts";

test("eksplicit opt-out er både afvisning og afmelding (Opus S2#2)", () => {
  for (const body of ["Fjern mig fra jeres liste", "Afmeld venligst", "Please unsubscribe", "Stop med at sende mails"]) {
    assert.equal(isRejection(body), true, body);
    assert.equal(isOptOut(body), true, body);
  }
});

test("høfligt nej er afvisning, men ikke afmelding", () => {
  for (const body of ["Nej tak", "Vi er ikke interesseret", "Det er ikke aktuelt"]) {
    assert.equal(isRejection(body), true, body);
    assert.equal(isOptOut(body), false, body);
  }
});

test("accept vinder over afvisning (uændret adfærd)", () => {
  assert.equal(isRejection("Ja tak, ring til mig"), false);
  assert.equal(isOptOut("Ja tak, ring til mig"), false);
});

test("eksplicit afmelding vinder over accept-ord; leadet vil stadig ringes op (Astra 9/10)", () => {
  const body = "Ring til mig, men fjern mig fra mailinglisten";
  assert.equal(isOptOut(body), true);
  assert.equal(wantsContact(body), true);
});

test("citeret afmeld-tekst i vores egen mail tæller ikke: kun selve svaret klassificeres (Astra 9/10)", () => {
  const raw = [
    "From: kunde@example.dk", "List-Unsubscribe: <mailto:x@kinly.dk?subject=unsubscribe>", "Content-Type: text/plain; charset=utf-8", "",
    "Hvad koster det?", "", "Den tor. 9. okt. 2026 kl. 10.00 skrev Lucas <lucas@kinly.dk>:", "> Skriv afmeld, hvis du ikke vil høre mere.",
  ].join("\r\n");
  const body = decodeMailBody(raw);
  assert.equal(body.includes("afmeld"), false);
  assert.equal(isRejection(body), false);
  assert.equal(isOptOut(body), false);
});

test("HTML-svar: citeret afmeld-tekst i blockquote/gmail_quote tæller ikke (Astra 9/10)", () => {
  for (const quote of ['<blockquote type="cite"><p>Skriv afmeld, hvis du ikke vil høre mere.</p></blockquote>',
    '<div class="gmail_quote"><div class="gmail_attr">Den tor. 9. okt. 2026 skrev Lucas:<br></div><blockquote class="gmail_quote"><p>Skriv afmeld</p><blockquote>gl. afmeld</blockquote></blockquote></div>',
    '<div id="divRplyFwdMsg"><b>Fra:</b> Lucas</div><div>Skriv afmeld, hvis du ikke vil høre mere.</div>']) {
    const raw = ["From: kunde@example.dk", "Content-Type: text/html; charset=utf-8", "", `<div>Hvad koster det?</div>${quote}`].join("\r\n");
    const body = decodeMailBody(raw);
    assert.equal(body.includes("Hvad koster det?"), true, body);
    assert.equal(isOptOut(body), false, body);
    assert.equal(isRejection(body), false, body);
  }
});

test("HTML-svar: ny tekst EFTER et citat tæller stadig (afmelding overses ikke, Astra 9/10)", () => {
  const raw = ["From: kunde@example.dk", "Content-Type: text/html; charset=utf-8", "",
    "<blockquote><p>Vil du se et tilbud?</p><blockquote>gammelt</blockquote></blockquote><p>Afmeld venligst</p>"].join("\r\n");
  const body = decodeMailBody(raw);
  assert.equal(body.includes("tilbud"), false, body);
  assert.equal(isOptOut(body), true, body);
});

test("HTML-svar: gmail_quote-div uden blockquote er citat; svar EFTER Gmail-citat med gmail_attr tæller (Astra runde 5)", () => {
  const html = (s: string) => decodeMailBody(["From: kunde@example.dk", "Content-Type: text/html; charset=utf-8", "", s].join("\r\n"));
  const quoted = html('<div>Hvad koster det?</div><div class="gmail_quote"><p>Skriv afmeld</p><div>indlejret</div><p>afmeld igen</p></div>');
  assert.equal(quoted.includes("Hvad koster det?"), true, quoted);
  assert.equal(isOptOut(quoted), false, quoted);
  const unclosed = html('<div>Hvad koster det?</div><div class="gmail_quote gmail_quote_container"><p>Skriv afmeld</p>');
  assert.equal(isOptOut(unclosed), false, unclosed);
  const after = html('<div class="gmail_quote"><div dir="ltr" class="gmail_attr">On Thu, Oct 9, 2026 Lucas wrote:<br></div><blockquote class="gmail_quote"><p>Vil du se et tilbud?</p></blockquote></div><div>Afmeld venligst</div>');
  assert.equal(after.includes("tilbud"), false, after);
  assert.equal(isOptOut(after), true, after);
});

test("HTML-svar: tags i kommentarer/style/script tæller ikke som blokke — afmelding efter citat bevares (Astra runde 6)", () => {
  for (const noise of ["<!-- <div> -->", "<style>.x::before{content:'<div>'}</style>", "<script>var s='<div>'</script>"]) {
    const raw = ["From: kunde@example.dk", "Content-Type: text/html; charset=utf-8", "",
      `<div class="gmail_quote">${noise}<blockquote>Tilbud</blockquote></div><p>Afmeld venligst</p>`].join("\r\n");
    const body = decodeMailBody(raw);
    assert.equal(isOptOut(body), true, `${noise} → ${body}`);
  }
});

test("HTML-svar: Outlooks betingede MSO-indhold er synlig tekst og bevares; almindelige kommentarer fjernes (Astra runde 7)", () => {
  const html = (s: string) => decodeMailBody(["From: kunde@example.dk", "Content-Type: text/html; charset=utf-8", "", s].join("\r\n"));
  const mso = html("<!--[if mso]><p>Afmeld venligst</p><![endif]-->");
  assert.equal(isOptOut(mso), true, mso);
  const rev = html("<!--[if !mso]><!--><p>Afmeld venligst</p><!--<![endif]-->");
  assert.equal(isOptOut(rev), true, rev);
  const plain = html("<p>Hvad koster det?</p><!-- afmeld -->");
  assert.equal(isOptOut(plain), false, plain);
});
