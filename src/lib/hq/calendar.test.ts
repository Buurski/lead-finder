import { test } from "node:test";
import assert from "node:assert/strict";
import { __setStore, InMemoryStore } from "../store.ts";
import { getIcsToken, icsTokenValid, rotateIcsToken, tasksToIcs } from "./calendar.ts";

test("ICS bruger CRLF, heldagsdato og escaped tekst", () => {
  const ics = tasksToIcs([{ id: "123", title: "Ring, igen; nu\\snart", due: "2026-09-23", clientName: "Bager Ø", note: "Afventer\nAllan" }], new Date("2026-09-22T10:11:12Z"));
  const unfolded = ics.replace(/\r\n /g, "");
  assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
  assert.match(ics, /UID:123@kinly-hq\r\nDTSTAMP:20260922T101112Z\r\nDTSTART;VALUE=DATE:20260923\r\n/);
  assert.match(unfolded, /SUMMARY:Ring\\, igen\\; nu\\\\snart · Bager Ø\r\n/);
  assert.match(unfolded, /DESCRIPTION:Afventer\\nAllan\\nhttps:\/\/lead-finder-three-beta\.vercel\.app\/opgaver\r\n/);
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.equal(ics.replace(/\r\n/g, "").includes("\n"), false);
});

test("ICS folder lange UTF-8-linjer ved højst 75 oktetter", () => {
  const ics = tasksToIcs([{ id: "x", title: "ø".repeat(100), due: "2026-09-23", clientName: "", note: "" }], new Date("2026-09-22T00:00:00Z"));
  for (const line of ics.split("\r\n")) assert.ok(Buffer.byteLength(line, "utf8") <= 75);
  assert.match(ics, /\r\n /);
});

test("kalendertoken: tilfældigt pr. bruger, roterbart, fail-closed", async () => {
  __setStore(new InMemoryStore());
  try {
    assert.equal(await icsTokenValid("lucas", "a".repeat(64)), false); // intet token gemt
    const t1 = await getIcsToken("lucas");
    assert.match(t1, /^[0-9a-f]{64}$/);
    assert.equal(await getIcsToken("lucas"), t1); // stabilt
    assert.equal(await icsTokenValid("lucas", t1), true);
    assert.equal(await icsTokenValid("charlie", t1), false); // brugerbundet
    assert.equal(await icsTokenValid("lucas", "xyz"), false);
    const t2 = await rotateIcsToken("lucas");
    assert.notEqual(t2, t1);
    assert.equal(await icsTokenValid("lucas", t1), false); // gammelt link dødt
    assert.equal(await icsTokenValid("lucas", t2), true);
  } finally {
    __setStore(null);
  }
});
