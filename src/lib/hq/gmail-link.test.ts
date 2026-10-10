import { test } from "node:test";
import assert from "node:assert/strict";
import { gmailRepliesUrl } from "./gmail-link.ts";

test("Se svar: ejerens indbakke, ellers den der kigger; adressen er kodet", () => {
  assert.equal(gmailRepliesUrl("info@salon.dk", "charlie", "lucas"), "https://mail.google.com/mail/?authuser=charlie@kinly.dk#search/from%3Ainfo%40salon.dk");
  assert.equal(gmailRepliesUrl(" a+b@x.dk ", "", "lucas"), "https://mail.google.com/mail/?authuser=lucas@kinly.dk#search/from%3Aa%2Bb%40x.dk");
  assert.match(gmailRepliesUrl("x@y.dk", "ukendt", "charlie"), /authuser=charlie@kinly\.dk/);
});
