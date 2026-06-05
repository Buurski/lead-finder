#!/usr/bin/env node
/*
 * test_integration.mjs — end-to-end wiring of the outreach pipeline with mocked
 * storage (InMemoryStore), no network, no AI, no real mail:
 *   lead -> compose -> canSendTo -> queue(append/read) -> reply-classify.
 *
 *   node scripts/test_integration.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const libUrl = (f) => pathToFileURL(path.join(REPO_ROOT, "src", "lib", f)).href;

const store = await import(libUrl("store.ts"));
store.__setStore(new store.InMemoryStore()); // mock storage before importing queue users

const { composeColdEmail } = await import(libUrl("compose.ts"));
const { canSendTo } = await import(libUrl("canSendTo.ts"));
const { validateDraft } = await import(libUrl("draft.ts"));
const { appendDrafts, readQueue, newDraftId } = await import(libUrl("queue.ts"));
const { classifyReply } = await import(libUrl("reply.ts"));

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

// 1. A lead enters the pipeline.
const lead = {
  id: "L1", name: "Salon Lumière", branch: "frisør", city: "Aarhus",
  email: "hej@salonlumiere.dk", emailStatus: "", status: "new",
  reviewsCount: 132, websiteStatus: "old", hooks: [],
};

// 2. Compose once (validated).
const composed = composeColdEmail(lead);
check("step compose: passes validateDraft", validateDraft(composed.text).ok);
check("step compose: has openerKind", typeof composed.openerKind === "string");

// 3. Send-gate allows this lead.
check("step gate: canSendTo ok", canSendTo(lead).ok === true);

// 4. Goes into the queue (async, in-memory store).
const draft = {
  id: newDraftId(), leadId: lead.id, name: lead.name, branch: lead.branch, city: lead.city,
  hooks: [], demoPair: composed.demoPair, professionalism: "", subject: composed.subject,
  body: composed.text, status: "pending", source: "daily-engine",
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  comboId: composed.comboId, openerKind: composed.openerKind,
};
await appendDrafts([draft]);
const q = await readQueue();
check("step queue: draft persisted", q.length === 1 && q[0].leadId === "L1");
check("step queue: comboId carried", q[0].comboId === composed.comboId);

// 4b. Re-running the engine must NOT stack a duplicate card for the same lead.
await appendDrafts([{ ...draft, id: newDraftId() }]);
const qDup = await readQueue();
check("step queue: duplicate pending leadId skipped", qDup.length === 1);

// 5. A reply comes back and is classified.
const cls = classifyReply("Ja tak, lad os gå videre — send en aftale!");
check("step reply: becameClient detected", cls.becameClient === true);
check("step reply: isInterested", cls.isInterested === true);

// 6. A hostile/blocked lead never reaches send.
check("blocked lead stopped at gate", canSendTo({ ...lead, name: "Thellufsenfoto" }).ok === false);
check("public entity stopped at gate", canSendTo({ ...lead, branch: "kommune" }).ok === false);

console.log(failures.length ? "FAILURES:\n  " + failures.join("\n  ") : "all integration checks ok");
console.log(`\ntest_integration — ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
