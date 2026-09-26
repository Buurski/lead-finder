import { test } from "node:test";
import assert from "node:assert/strict";
import { eventIdFor, syncCalendar, toEvents, type CalApi, type CalEvent } from "./gcal-sync.ts";
import type { MyDayItem } from "./tasks.ts";

const item = (p: Partial<MyDayItem>): MyDayItem => ({
  id: "t1", kind: "task", title: "Ring til Allan", context: "Opgave", companyId: "c1", company: "Ikast", owner: "lucas",
  due: "2026-09-28", dueTime: "", note: "", important: false, bucket: "kommende", ...p,
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

test("toEvents: tidsat opgave lægges på sit eget tidspunkt (30 min), forfalden flyttes til i dag", () => {
  const [ev] = toEvents([item({ dueTime: "14:00" })], "2026-09-25");
  assert.equal(ev.start.dateTime, "2026-09-28T14:00:00");
  assert.equal(ev.end.dateTime, "2026-09-28T14:30:00");
  assert.match(ev.summary, /Ring til Allan · Ikast/);
  assert.match(ev.id, /^[a-v0-9]{5,1024}$/);
  const [late] = toEvents([item({ due: "2026-09-20", dueTime: "14:00" })], "2026-09-25");
  assert.equal(late.start.dateTime, "2026-09-25T14:00:00");
  assert.match(late.summary, /forfalden/);
  assert.equal(toEvents([item({ due: "" })], "2026-09-25").length, 0);
});

test("toEvents: tidsat påmindelse rammer kl. 17 dagen før + på tidspunktet", () => {
  const [ev] = toEvents([item({ dueTime: "14:00" })], "2026-09-25");
  // kl. 17 dagen før 14:00 = 21 timer før = 1260 min.
  assert.deepEqual(ev.reminders.overrides.map((o) => o.minutes), [1260, 0]);
});

test("toEvents: tidløse opgaver samme dag fordeles 09:00, 09:15, … (vigtige først, så efter id); tidsat opgave uændret", () => {
  const events = toEvents(
    [
      item({ id: "b", important: false }),
      item({ id: "a", important: false }),
      item({ id: "z", important: true }),
      item({ id: "timed", dueTime: "11:00" }),
    ],
    "2026-09-25",
  );
  const byId = new Map(events.map((e) => [e.id, e]));
  // Vigtig først, dernæst stigende id.
  assert.equal(byId.get(eventIdFor("z"))!.start.dateTime, "2026-09-28T09:00:00");
  assert.equal(byId.get(eventIdFor("a"))!.start.dateTime, "2026-09-28T09:15:00");
  assert.equal(byId.get(eventIdFor("b"))!.start.dateTime, "2026-09-28T09:30:00");
  assert.equal(byId.get(eventIdFor("a"))!.end.dateTime, "2026-09-28T09:30:00"); // 15-min-slot
  // Tidsat opgave påvirkes ikke af slot-fordelingen.
  assert.equal(byId.get(eventIdFor("timed"))!.start.dateTime, "2026-09-28T11:00:00");
  assert.equal(byId.get(eventIdFor("timed"))!.end.dateTime, "2026-09-28T11:30:00");
});

test("toEvents: hash ændres når klokkeslættet ændres (så update sendes)", () => {
  const [a] = toEvents([item({ dueTime: "10:00" })], "2026-09-25");
  const [b] = toEvents([item({ dueTime: "11:00" })], "2026-09-25");
  assert.notEqual(a.extendedProperties.private.hash, b.extendedProperties.private.hash);
  const [same] = toEvents([item({ dueTime: "10:00" })], "2026-09-25");
  assert.equal(a.extendedProperties.private.hash, same.extendedProperties.private.hash);
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
