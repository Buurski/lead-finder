import { test } from "node:test";
import assert from "node:assert/strict";
import { asksForCall, isAutoReplyMail, parseReply, SNIPPET_MAX } from "./reply-parse.ts";

const mail = (body: string, extraHeaders = "", subject = "Re: En lille hilsen") =>
  `From: Karina <karina@salon.dk>\r\nSubject: ${subject}\r\n${extraHeaders}Content-Type: text/plain; charset=utf-8\r\n\r\n${body}`;

test("signatur efter '-- ' og telefonnummer deri kommer ikke med; ja-svar klassificeres", () => {
  const p = parseReply(mail("Ja tak, det lyder spændende. Hvad koster det?\r\n\r\nMvh Karina\r\n\r\n-- \r\nKarina Salon\r\nTlf 12 34 56 78\r\n"), "Re: En lille hilsen");
  assert.equal(p.category, "interested");
  assert.ok(p.snippet.startsWith("Ja tak, det lyder spændende."));
  assert.ok(!p.snippet.includes("Tlf"));
  assert.equal(p.asksCall, false); // et nummer i signaturen er ikke en bøn om opkald
});

test("'Ring gerne' giver asksCall; 'Sendt fra min iPhone' klippes", () => {
  const p = parseReply(mail("Ring gerne til mig i morgen.\r\n\r\nSendt fra min iPhone"), "Re: x");
  assert.equal(p.asksCall, true);
  assert.equal(p.snippet, "Ring gerne til mig i morgen.");
});

test("citeret historik klippes væk", () => {
  const p = parseReply(mail("Nej tak, ikke aktuelt.\r\n\r\nDen 3. juli 2026 skrev Lucas:\r\n> Hej Karina, vi bygger hjemmesider\r\n> ring til os"), "Re: x");
  assert.equal(p.snippet, "Nej tak, ikke aktuelt.");
  assert.equal(p.category, "not-interested");
  assert.equal(p.asksCall, false); // 'ring' stod kun i citatet
});

test("autosvar: header eller emne, aldrig asksCall", () => {
  assert.equal(isAutoReplyMail(mail("Jeg er på ferie", "Auto-Submitted: auto-replied\r\n"), "Re: x"), true);
  assert.equal(isAutoReplyMail(mail("Jeg er på ferie", "Precedence: auto_reply\r\n"), "Re: x"), true);
  assert.equal(isAutoReplyMail(mail("hej"), "Automatisk svar: Re: En lille hilsen"), true);
  assert.equal(isAutoReplyMail(mail("hej", "Auto-Submitted: no\r\n"), "Re: x"), false);
  const p = parseReply(mail("Ring til mig på 12345678", "X-Autoreply: yes\r\n"), "Re: x");
  assert.equal(p.category, "auto-reply");
  assert.equal(p.asksCall, false);
});

test("afmeld klassificeres som unsubscribe", () => {
  assert.equal(parseReply(mail("Fjern mig fra jeres liste."), "Re: x").category, "unsubscribe");
});

test("uddrag klippes ved højst 600 tegn med ellipsis; kategori læser hele teksten", () => {
  const long = "Det her er en lang besked. ".repeat(60) + "Fjern mig fra listen.";
  const p = parseReply(mail(long), "Re: x");
  assert.ok([...p.snippet].length <= SNIPPET_MAX);
  assert.ok(p.snippet.endsWith("…"));
  assert.equal(p.category, "unsubscribe"); // "fjern mig" står efter klippet
});

test("asksForCall: ring/ringe/giv et ring/telefonsamtale ja; ringer/ringede/bart nummer nej", () => {
  for (const t of ["I må gerne ringe", "Ring mig op", "giv mig et ring", "vi kan tage en telefonsamtale"]) assert.equal(asksForCall(t), true, t);
  for (const t of ["vi ringer til jer", "han ringede i går", "mit nummer er 12 34 56 78", "CVR 12345678"]) assert.equal(asksForCall(t), false, t);
});

test("tom brødtekst giver tomt uddrag og kategori other", () => {
  const p = parseReply(mail(""), "Re: x");
  assert.equal(p.snippet, "");
  assert.equal(p.category, "other");
});
