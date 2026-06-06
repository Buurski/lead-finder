#!/usr/bin/env node
/*
 * test_store.mjs — offline tests for the resilient JSONL parser
 * (src/lib/store.ts parseJsonl) and the InMemoryStore driver. Pure: no real fs,
 * no network. Guards the failure mode where one corrupt line in an append-only
 * log (e.g. a crash mid-append to spend.jsonl) discarded the whole log.
 *
 *   node scripts/test_store.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const { parseJsonl, InMemoryStore } = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "store.ts")).href);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- parseJsonl ----------------------------------------------------------
check("parses clean jsonl", eq(parseJsonl('{"a":1}\n{"a":2}\n'), [{ a: 1 }, { a: 2 }]));
check("skips blank lines", eq(parseJsonl('{"a":1}\n\n{"a":2}'), [{ a: 1 }, { a: 2 }]));
// The core regression: a corrupt/half-written line must NOT discard the rest.
check("skips corrupt line, keeps valid", eq(parseJsonl('{"a":1}\n{bad json\n{"a":3}'), [{ a: 1 }, { a: 3 }]));
check("trailing half-written line dropped", eq(parseJsonl('{"a":1}\n{"a":2'), [{ a: 1 }]));
check("empty string → empty", eq(parseJsonl(""), []));
check("only-whitespace newlines → empty", eq(parseJsonl("\n\n\n"), []));

// ---- InMemoryStore -------------------------------------------------------
const mem = new InMemoryStore();
await mem.put("k", { v: 1 });
check("get returns put value", eq(await mem.get("k"), { v: 1 }));
check("get missing → null", (await mem.get("nope")) === null);
await mem.append("log", { e: 1 });
await mem.append("log", { e: 2 });
check("append+readAll", eq(await mem.readAll("log"), [{ e: 1 }, { e: 2 }]));
check("readAll missing → empty", eq(await mem.readAll("nolog"), []));
await mem.put("pre_a", 1); await mem.put("pre_b", 2);
check("list by prefix", eq((await mem.list("pre_")).sort(), ["pre_a", "pre_b"]));
await mem.delete("k");
check("delete removes", (await mem.get("k")) === null);

console.log(`test_store — ${pass} passed, ${fail} failed`);
if (failures.length) console.log("FAILURES:\n  " + failures.join("\n  "));
process.exit(fail ? 1 : 0);
