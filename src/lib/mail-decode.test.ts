import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeMailBody } from "./mail-decode.ts";
import { isOptOut } from "./rejections.ts";

// Realistiske svar fra Gmail/Outlook/Apple, også indlejret multipart med bilag/logo (Opus 9/10).
const OUR = "Hej, vi bygger hjemmesider. Skriv afmeld hvis du ikke vil høre mere.";
const qp = (s: string) => Buffer.from(s, "utf8").toString("latin1").replace(/[^\x20-\x7e\n]|=/g, (c) => "=" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64").replace(/(.{76})/g, "$1\n");
const html1 = (h: string, cte = "quoted-printable") => `Content-Type: text/html; charset="UTF-8"\nContent-Transfer-Encoding: ${cte}\n\n${cte === "base64" ? b64(h) : qp(h)}`;
const plain = (t: string, cte = "quoted-printable") => `Content-Type: text/plain; charset="UTF-8"\nContent-Transfer-Encoding: ${cte}\n\n${cte === "base64" ? b64(t) : qp(t)}`;
const mp = (type: string, b: string, parts: string[]) => `Content-Type: multipart/${type}; boundary="${b}"\n\n` + parts.map((p) => `--${b}\n${p}\n`).join("") + `--${b}--\n`;
const top = (body: string) => `From: kunde@firma.dk\nTo: lucas@kinly.dk\nSubject: Re: Hjemmeside\nMIME-Version: 1.0\n` + body;
const gAttr = `Den tor. 9. okt. 2026 kl. 10.00 skrev Lucas Buur <lucas@kinly.dk>:`;
const gHtml = (reply: string) => `<div dir="ltr">${reply}</div><br><div class="gmail_quote gmail_quote_container"><div dir="ltr" class="gmail_attr">${gAttr}<br></div><blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex"><div dir="ltr">${OUR}</div></blockquote></div>`;
const gPlain = (reply: string) => `${reply}\n\n${gAttr}\n\n> ${OUR}\n`;
const att = `Content-Type: application/pdf; name="cv.pdf"\nContent-Disposition: attachment; filename="cv.pdf"\nContent-Transfer-Encoding: base64\n\nJVBERi0xLjQK\n`;
const txtAtt = `Content-Type: text/plain; name="noter.txt"\nContent-Disposition: attachment; filename="noter.txt"\n\nafmeld\n`;
const olHtml = (reply: string) => `<html><head><style>P {margin-top:0;}</style></head><body dir="ltr"><div class="elementToProof" style="font-family:Aptos">${reply}</div><div id="appendonsend"></div><hr style="display:inline-block;width:98%"><div id="divRplyFwdMsg" dir="ltr"><font face="Calibri"><b>Fra:</b> Lucas Buur &lt;lucas@kinly.dk&gt;<br><b>Sendt:</b> 9. oktober 2026 10:00<br></font></div><div>${OUR}</div></body></html>`;
const olPlain = (reply: string) => `${reply}\n\n________________________________\nFra: Lucas Buur <lucas@kinly.dk>\nSendt: 9. oktober 2026 10:00\nTil: kunde@firma.dk\nEmne: Hjemmeside\n\n${OUR}\n`;
const apHtml = (before: string, after: string) => `<html><head><meta http-equiv="content-type" content="text/html; charset=utf-8"></head><body dir="auto">${before}<div dir="ltr"><br><blockquote type="cite">${gAttr}<br><br></blockquote></div><blockquote type="cite"><div dir="ltr">${OUR}</div></blockquote>${after}</body></html>`;
const logo = `Content-Type: image/png\nContent-ID: <logo>\nContent-Transfer-Encoding: base64\n\niVBORw0KGgo=\n`;

const cases: [string, string, boolean][] = [
  ["Gmail alt, ja tak over citat", top(mp("alternative", "g1", [plain(gPlain("Ja tak, ring til mig")), html1(gHtml("Ja tak, ring til mig"))])), false],
  ["Gmail HTML-only, afmeld EFTER citat", top(html1(gHtml("Hej") + "<div dir=\"ltr\">Fjern mig fra listen</div>")), true],
  ["Gmail mixed+bilag, svar over citat", top(mp("mixed", "m1", [mp("alternative", "g2", [plain(gPlain("Lyder spændende, se vedhæftet")), html1(gHtml("Lyder spændende, se vedhæftet"))]), att])), false],
  ["iOS mixed+foto, afmeld over citat", top(mp("mixed", "m2", [mp("alternative", "a1", [plain("Afmeld venligst\n\n" + gAttr + "\n\n> " + OUR), html1(apHtml("<div>Afmeld venligst</div>", ""))]), att])), true],
  ["Outlook web alt base64, fjern mig", top(mp("alternative", "o1", [plain(olPlain("Fjern mig fra listen"), "base64"), html1(olHtml("Fjern mig fra listen"), "base64")])), true],
  ["Outlook related base64 (logo-signatur), fjern mig", top(mp("related", "r1", [mp("alternative", "o2", [plain(olPlain("Fjern mig fra listen"), "base64"), html1(olHtml("Fjern mig fra listen"), "base64")]), logo])), true],
  ["Outlook mixed+bilag base64, ja tak (citat m. afmeld)", top(mp("mixed", "m3", [mp("alternative", "o3", [plain(olPlain("Ja tak"), "base64"), html1(olHtml("Ja tak"), "base64")]), att])), false],
  ["Outlook web HTML-only, ja tak", top(html1(olHtml("Ja tak"))), false],
  ["Apple HTML-only bundsvar afmeld", top(html1(apHtml("", "<div dir=\"ltr\"><br></div><div>Afmeld mig tak</div>"))), true],
  ["mixed med vedhæftet .txt der siger afmeld, svar ja tak", top(mp("mixed", "m4", [txtAtt, plain("Ja tak, ring gerne")])), false],
  ["related > html-only (ingen plain), fjern mig", top(mp("related", "r2", [html1(olHtml("Fjern mig fra listen"), "base64"), logo])), true],
];

for (const [name, raw, want] of cases) {
  test(`mail-decode: ${name}`, () => {
    const body = decodeMailBody(raw);
    assert.equal(isOptOut(body), want, JSON.stringify(body.slice(0, 200)));
  });
}
