import { test } from "node:test";
import assert from "node:assert/strict";
import { issueSession, verifySession } from "../cc-auth.ts";

const SECRET = "test-secret";

test("session bærer brugeren og verificeres", async () => {
  const tok = await issueSession("charlie", SECRET);
  assert.equal(await verifySession(tok, SECRET), "charlie");
});

test("forfalsket bruger eller forkert secret afvises", async () => {
  const tok = await issueSession("charlie", SECRET);
  const [, exp, sig] = tok.split(".");
  assert.equal(await verifySession(`lucas.${exp}.${sig}`, SECRET), null);
  assert.equal(await verifySession(tok, "andet-secret"), null);
  assert.equal(await verifySession("rod", SECRET), null);
});

test("udløbet session afvises", async () => {
  const { hmacHex } = await import("../cc-auth.ts");
  const exp = Math.floor(Date.now() / 1000) - 1;
  const tok = `lucas.${exp}.${await hmacHex(SECRET, `lucas.${exp}`)}`;
  assert.equal(await verifySession(tok, SECRET), null);
});

test("gammel delt cookie kan aldrig blive en person", async () => {
  const { personFromSessionUser, sessionUserFor } = await import("./magic-session.ts");
  assert.equal(personFromSessionUser(sessionUserFor("charlie")), "charlie");
  assert.equal(personFromSessionUser("lucas"), null); // Basic-brugernavn "lucas"
  assert.equal(personFromSessionUser("delt"), null);
  assert.equal(personFromSessionUser(null), null);
});
