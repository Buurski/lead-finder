#!/usr/bin/env node
/*
 * test_mail_decode.mjs — offline tests for src/lib/mail-decode.ts (the "=E6 → æ"
 * fix for the Svar page). Pure.
 *   node scripts/test_mail_decode.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const { decodeQuotedPrintable, decodeMailBody, cleanupBody } = await import(pathToFileURL(path.join(ROOT, "src", "lib", "mail-decode.ts")).href);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

// quoted-printable + windows-1252 (the real example Lucas pasted)
check("=E6 → æ (windows-1252)", decodeQuotedPrintable("p=E6nt", "Windows-1252") === "pænt");
check("=F8 → ø", decodeQuotedPrintable("r=F8d", "iso-8859-1") === "rød");
check("soft line break joined", decodeQuotedPrintable("lang=\r\ntekst") === "langtekst");
check("plain text untouched", decodeQuotedPrintable("hello world") === "hello world");

// full single-part message with QP + charset header
const raw = [
  "From: Kunde <kunde@firma.dk>",
  "Subject: Re: tilbud",
  'Content-Type: text/plain; charset="Windows-1252"',
  "Content-Transfer-Encoding: quoted-printable",
  "",
  "Hej Lucas",
  "Det er rigtig p=E6nt af dig og tak for tilbuddet, men vi er i fuld gang med=",
  " at f=E5 lavet en ny hjemmeside.",
].join("\r\n");
const decoded = decodeMailBody(raw);
check("decodeMailBody resolves æ/å", decoded.includes("pænt") && decoded.includes("få"));
check("decodeMailBody joins soft break", decoded.includes("med at få"));
check("no raw =E6 left", !decoded.includes("=E6"));

// multipart: picks text/plain
const mp = [
  'Content-Type: multipart/alternative; boundary="BND"',
  "",
  "--BND",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Ren tekst her",
  "--BND",
  "Content-Type: text/html; charset=utf-8",
  "",
  "<p>HTML udgave</p>",
  "--BND--",
].join("\r\n");
check("multipart picks text/plain", decodeMailBody(mp).trim() === "Ren tekst her");

// cleanup strips quoted history
check("cleanup drops quoted lines", !cleanupBody("Mit svar\n> tidligere mail\n> mere citat").includes("tidligere"));

console.log(`test_mail_decode — ${pass} passed, ${fail} failed`);
if (failures.length) console.log("FAILURES:\n  " + failures.join("\n  "));
process.exit(fail ? 1 : 0);
