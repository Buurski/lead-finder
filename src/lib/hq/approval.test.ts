import { test } from "node:test";
import assert from "node:assert/strict";
import { approvalLine, APPROVAL_LABEL, parseApproval, prependApproval, withApproval } from "./approval.ts";

// Den reelle note på d0678f12 (kun de to første linjer + starten på planen).
const LEGACY = [
  "Beslutning fra Lucas GODKENDT",
  "Godkend eller afvis ved at redigere denne linje i Note og gemme. Klaret alene er ikke godkendelse. Dette er en manuel beslutningsnote, ikke en teststart. Godkendelse gælder retningen; ingen automatisk deploy.",
  "",
  "Mål: flere relevante kundehenvendelser, ikke flere visninger til alle URLer.",
].join("\n");

const rest = (s: string) => s.slice(s.indexOf("\n") + 1);

test("parseApproval læser den reelle legacy-linje", () => {
  assert.deepEqual(parseApproval(LEGACY), { status: "godkendt", actor: "Lucas" });
});

test("parseApproval: kun første linje tæller", () => {
  // Skjult markør længere nede må ikke give en beslutning.
  assert.equal(parseApproval("Almindelig note\nBeslutning fra Lucas AFVENTER"), null);
  // En titel der starter med "Godkend" er ikke en godkendelsesopgave.
  assert.equal(parseApproval("Godkend samlet synlighedsplan for Kinlys undersider"), null);
});

test("parseApproval afviser ukendt status og navn", () => {
  assert.equal(parseApproval("Beslutning fra Lucas MÅSKE"), null);
  assert.equal(parseApproval("Beslutning fra Allan AFVENTER"), null);
  assert.equal(parseApproval("Beslutning fra lucas AFVENTER"), null);
  assert.equal(parseApproval("Beslutning fra Lucas GODKENDT ekstra"), null);
  assert.equal(parseApproval(""), null);
});

test("parseApproval tåler \\r\\n og omkringliggende mellemrum", () => {
  assert.deepEqual(parseApproval("  Beslutning fra Charlie AFVENTER \r\nplan"), { status: "afventer", actor: "Charlie" });
});

test("withApproval bevarer resten af noten ordret (byte for byte)", () => {
  const out = withApproval(LEGACY, "Lucas", "afvist");
  assert.equal(out.split("\n")[0], "Beslutning fra Lucas AFVIST");
  assert.equal(rest(out), rest(LEGACY));
  assert.equal(Buffer.from(rest(out)).equals(Buffer.from(rest(LEGACY))), true, "resten må ikke ændres");
});

test("withApproval: note uden linjeskift → kun markøren", () => {
  assert.equal(withApproval("", "Charlie", "afventer"), "Beslutning fra Charlie AFVENTER");
  assert.equal(withApproval("gammel linje", "Lucas", "godkendt"), "Beslutning fra Lucas GODKENDT");
});

test("prependApproval bevarer en almindelig note som tekst under markøren", () => {
  assert.equal(prependApproval("Afventer Allans svar", "Lucas"), "Beslutning fra Lucas AFVENTER\nAfventer Allans svar");
  assert.equal(prependApproval("", "Charlie"), "Beslutning fra Charlie AFVENTER");
  assert.equal(parseApproval(prependApproval("Hej", "Lucas"))?.status, "afventer");
  const out = prependApproval("Linje 1\nLinje 2", "Lucas");
  assert.equal(out, "Beslutning fra Lucas AFVENTER\nLinje 1\nLinje 2");
});

test("approvalLine og APPROVAL_LABEL", () => {
  assert.equal(approvalLine("Lucas", "afventer"), "Beslutning fra Lucas AFVENTER");
  assert.equal(approvalLine("Charlie", "godkendt"), "Beslutning fra Charlie GODKENDT");
  assert.equal(approvalLine("Lucas", "afvist"), "Beslutning fra Lucas AFVIST");
  assert.equal(APPROVAL_LABEL.afventer, "Afventer godkendelse");
  assert.equal(APPROVAL_LABEL.godkendt, "Godkendt");
  assert.equal(APPROVAL_LABEL.afvist, "Afvist");
});
