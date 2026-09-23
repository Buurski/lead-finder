import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { POST } from "./route.ts";
import { __setDb, type Db } from "../../../../lib/db/client.ts";
import { freshTestDb } from "../../../../lib/db/test-db.ts";
import { activity, task } from "../../../../lib/db/schema.ts";
import { hermesSignature } from "../../../../lib/hermes-hmac.ts";

// Handleren kaldes direkte med et signeret Request — samme HMAC-skema som i
// prod: X-Timestamp + Bearer hmac(`${ts}.POST.${path}.${body}`).
const SECRET = "test-hemmelig-hmac";
process.env.HERMES_API_SECRET = SECRET;
process.env.DATA_BACKEND = "pg";

let db: Db;

beforeEach(async () => {
  db = await freshTestDb();
});
after(() => __setDb(null));

function signed(body: string, opts: { secret?: string; path?: string } = {}) {
  const ts = String(Math.floor(Date.now() / 1000));
  const path = opts.path ?? "/api/agent/tasks";
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-timestamp": ts,
      authorization: `Bearer ${hermesSignature(opts.secret ?? SECRET, ts, "POST", path, body)}`,
    },
    body,
  });
}

const post = (payload: unknown, opts: { secret?: string; path?: string } = {}) => POST(signed(JSON.stringify(payload), opts));

test("create opretter opgaven med actor som standard-ejer", async () => {
  const res = await post({ actor: "lucas", action: "create", title: "  Ring til Ikast  ", due: "2026-09-30" });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(json.task.title, "Ring til Ikast");
  assert.equal(json.task.owner, "lucas");
  assert.equal(json.task.due, "2026-09-30");

  const [row] = await db.select().from(task).where(eq(task.id, json.task.id));
  assert.equal(row.title, "Ring til Ikast");
  assert.equal(row.doneAt, null);
});

test("update retter titel, dato og ejer", async () => {
  const created = await (await post({ actor: "lucas", action: "create", title: "Send tilbud" })).json();
  const res = await post({ actor: "charlie", action: "update", id: created.task.id, fields: { title: "Send tilbud v2", due: "2026-10-05", owner: "charlie" } });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.task.title, "Send tilbud v2");
  assert.equal(json.task.due, "2026-10-05");
  assert.equal(json.task.owner, "charlie");
});

test("complete sætter doneAt og logger en aktivitet", async () => {
  const created = await (await post({ actor: "lucas", action: "create", title: "Betal moms" })).json();
  const res = await post({ actor: "charlie", action: "complete", id: created.task.id });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.ok(json.task.doneAt);

  const [log] = await db.select().from(activity).where(eq(activity.type, "opgave"));
  assert.equal(log.actor, "charlie");
  assert.equal(log.summary, "Opgave klaret: Betal moms");
});

test("list giver åbne opgaver, filtreret på ejer", async () => {
  await post({ actor: "lucas", action: "create", title: "Lucas-opgave" });
  await post({ actor: "charlie", action: "create", title: "Charlie-opgave" });

  const alle = await (await post({ actor: "lucas", action: "list" })).json();
  assert.equal(alle.ok, true);
  assert.deepEqual(alle.items.map((i: { title: string }) => i.title), ["Lucas-opgave", "Charlie-opgave"]);

  const mine = await (await post({ actor: "lucas", action: "list", owner: "lucas" })).json();
  assert.deepEqual(mine.items.map((i: { title: string }) => i.title), ["Lucas-opgave"]);
});

test("forkert signatur giver 401 uden detaljer", async () => {
  const res = await post({ actor: "lucas", action: "list" }, { secret: "forkert" });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { ok: false, error: "unauthorized" });
});

test("ukendt actor, ukendt action og manglende titel giver 400", async () => {
  const actor = await post({ actor: "hermes", action: "list" });
  assert.equal(actor.status, 400);
  assert.equal((await actor.json()).ok, false);

  const action = await post({ actor: "lucas", action: "slet-alt" });
  assert.equal(action.status, 400);

  const title = await post({ actor: "lucas", action: "create" });
  assert.equal(title.status, 400);
  assert.equal((await title.json()).error, "titel skal være tekst");

  const tom = await db.select().from(task);
  assert.equal(tom.length, 0);
});

test("body over 4000 tegn afvises", async () => {
  const res = await post({ actor: "lucas", action: "create", title: "x".repeat(4100) });
  assert.equal(res.status, 413);
  assert.deepEqual(await res.json(), { ok: false, error: "for stor" });
});
