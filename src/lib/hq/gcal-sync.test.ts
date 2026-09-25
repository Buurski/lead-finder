import { test } from "node:test";
import assert from "node:assert/strict";
import { eventIdFor, syncCalendar, toEvent, type CalApi, type CalEvent } from "./gcal-sync.ts";
import type { MyDayItem } from "./tasks.ts";

const item = (p: Partial<MyDayItem>): MyDayItem => ({
  id: "t1", kind: "task", title: "Ring til Allan", context: "Opgave", companyId: "c1", company: "Ikast", owner: "lucas",
  due: "2026-09-28", note: "", important: false, bucket: "kommende", ...p,
});

function fakeApi(start: Map<string, string> = new Map()) {
  const cal = new Map(start);
  const log: string[] = [];
  const api: CalApi = {
    async list() { return new Map(cal); },
    async insert(_c, ev: CalEvent) { log.push(`insert ${ev.id}`); cal.set(ev.id, ev.extendedProperties.private.hash); },
    async update(_c, ev: CalEvent) { log.push(`update ${ev.id}`); cal.set(ev.id, ev.extendedProperties.private.hash); },
    async remove(_c, id) { log.push(`remove ${id}`); cal.delete(id); },
  };
  return { api, cal, log };
}

test("toEvent: kl. 08 på datoen, påmindelse kl. 17 dagen før + kl. 08; forfalden flyttes til i dag", () => {
  const ev = toEvent(item({}), "2026-09-25")!;
  assert.equal(ev.start.dateTime, "2026-09-28T08:00:00");
  assert.deepEqual(ev.reminders.overrides.map((o) => o.minutes), [900, 0]);
  assert.match(ev.summary, /Ring til Allan · Ikast/);
  assert.match(ev.id, /^[a-v0-9]{5,1024}$/);
  const late = toEvent(item({ due: "2026-09-20" }), "2026-09-25")!;
  assert.equal(late.start.dateTime, "2026-09-25T08:00:00");
  assert.match(late.summary, /forfalden/);
  assert.equal(toEvent(item({ due: "" }), "2026-09-25"), null);
});

test("syncCalendar: kun forskelle skrives; lukkede fjernes; andres ejer ignoreres; idempotent", async () => {
  const { api, log } = fakeApi(new Map([[eventIdFor("gammel"), "x"]]));
  const items = [item({}), item({ id: "d", kind: "deal", owner: "", due: "2026-09-26" }), item({ id: "c", owner: "charlie" })];
  const r1 = await syncCalendar(api, "cal", "lucas", items, "2026-09-25");
  assert.deepEqual({ i: r1.inserted, u: r1.updated, r: r1.removed }, { i: 2, u: 0, r: 1 });
  assert.ok(!log.some((l) => l.includes(eventIdFor("c"))), "charlies opgave må ikke i Lucas' kalender");
  log.length = 0;
  const r2 = await syncCalendar(api, "cal", "lucas", items, "2026-09-25");
  assert.deepEqual({ i: r2.inserted, u: r2.updated, r: r2.removed }, { i: 0, u: 0, r: 0 });
  const r3 = await syncCalendar(api, "cal", "lucas", [item({ title: "Ring til Allan igen" })], "2026-09-25");
  assert.deepEqual({ i: r3.inserted, u: r3.updated, r: r3.removed }, { i: 0, u: 1, r: 1 });
});

test("syncCalendar: én fejl stopper ikke resten, men kastes til sidst", async () => {
  const { api, cal } = fakeApi();
  api.insert = async (_c, ev) => { if (ev.id === eventIdFor("t1")) throw new Error("boom"); cal.set(ev.id, "h"); };
  await assert.rejects(syncCalendar(api, "cal", "lucas", [item({}), item({ id: "t2" })], "2026-09-25"), /1 fejl/);
  assert.ok(cal.has(eventIdFor("t2")));
});
