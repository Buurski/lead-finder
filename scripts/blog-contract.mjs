// Offline kontrakttest for blog-udgiver-kæden (Lucas' releasegab, 9/10-2026).
// Kører den EKSISTERENDE kæde offline: HQ-eksporten (lead-system, TypeScript)
// og udgiver-scriptet (kinly-site). Ingen netværk, ingen HQ-skrivning, ingen
// publicering. Fetch stubbes; git kører i et temp-repo med en bare origin.
// Ændrer ALDRIG noget i de to repoer — rapport og fixtures lander i scratch.
//
//   node --experimental-strip-types --conditions react-server scripts/blog-contract.mjs
//
// Exit 0 + 10/10 = releasegabet er lukket: revision bevares i pending,
// live-confirm kræver menneskets release-SHA, tom kø er tavs.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { freshTestDb } from "../src/lib/db/test-db.ts";
import { createPost, getPost, recordJev, revisionOf, updatePost } from "../src/lib/hq/posts.ts";
import { confirmPublished, exportablePosts } from "../src/lib/hq/blog-export.ts";

const site = "/root/kinly-site"; // udgiver-kæden (samme VPS, andet repo)
const base = mkdtempSync("/root/.hermes/cache/scratch/blog-contract-");
const findings = [];
const check = async (name, fn) => {
  try {
    await fn();
    findings.push({ name, pass: true });
  } catch (e) {
    findings.push({ name, pass: false, error: e.message });
  }
};
const db = await freshTestDb(); // memory-only PGlite, isolated migrations
const cand = (s) => ({
  id: `fixture-${s}`,
  url: `https://fixture.invalid/${s}.png`,
  placement: s === "a" ? "hero" : "inline",
  alt: `Syntetisk testillustration uden kundeindhold, variant ${s}`,
  credit: "Kinly test",
  source: "synthetic fixture",
  mobileUrl: "",
  desktopUrl: "",
});

async function green(title) {
  const p = await createPost(db, { title }, "hermes");
  const para = Array.from({ length: 40 }, (_, n) => `ord${n}`).join(" ");
  const body = [
    "Syntetisk åbning.",
    "Kort syntetisk svar.",
    "## Testafsnit",
    ...Array.from({ length: 16 }, () => para),
    "Læs [testside](https://kinly.dk/brancher/haandvaerk/) og [testcase](https://kinly.dk/cases/test/).",
    "## Hvad kan du gøre nu",
    "- Læs fixture\n- Sammenlign fixture\n- Gem fixture",
    `[SEO-tjek](/seo-tjek/?ref=blog-${p.slug})`,
  ].join("\n\n");
  await updatePost(
    db,
    p.id,
    {
      category: "hjemmeside",
      excerpt: "Dette er en rent syntetisk fixture til offline kontrakttest. Den beskriver ikke en kunde og må aldrig publiceres live.",
      body,
      images: { a: cand("a"), b: cand("b") },
      proofs: {
        sources: [1, 2, 3, 4, 5].map((n) => ({ url: `https://fixture.invalid/source-${n}`, date: "2026-10-06", claim: `Syntetisk testpåstand ${n}`, method: "offline fixture" })),
        faq: [1, 2, 3].map((n) => ({ q: `Syntetisk spørgsmål ${n}?`, a: `Syntetisk svar ${n}.` })),
        council: { reviewer: "synthetic", log: "offline", findings: "synthetic", retest: "synthetic" },
      },
    },
    "hermes",
  );
  await updatePost(db, p.id, { images: { choice: "both" }, proofs: { factcheck: { note: "offline synthetic human" } } }, "charlie");
  await assert.rejects(updatePost(db, p.id, { stage: "publicer" }, "hermes"));
  await recordJev(db, p.id, { ready: true, score: 0.9, issue: "" }, "lucas");
  return updatePost(db, p.id, { stage: "publicer" }, "charlie");
}

const p = await green("Syntetisk kontrakttest uden publicering");
const exportedData = await exportablePosts(db, new Date("2026-10-06T10:00:00Z"));
const exported = exportedData.items[0];
assert.ok(exported, "valid synthetic export required");

await check("server_validate_human_gate_and_deterministic_export", async () => {
  assert.deepEqual(exportedData, await exportablePosts(db, new Date("2026-10-06T10:00:00Z")));
  assert.equal(exportedData.items.length, 1);
  assert.equal(exported.revision, revisionOf(p));
});

writeFileSync(`${base}/synthetic-export.json`, JSON.stringify(exportedData, null, 2));

// Udgiver-kæden kører som subprocess-lignende import i et rigtigt temp-repo:
// prepare committerer manifestet på en privat gren, og det kræver en origin.
const realFetch = globalThis.fetch;
const realLog = console.log;
const cwd = process.cwd();
const argv = process.argv;
let items = [exported];
const logs = [];
const requests = [];
const posted = [];
let phase = "prepare";
let liveHtml = "";
globalThis.fetch = async (u, options = {}) => {
  const url = String(u);
  requests.push({ url, method: options.method || "GET" });
  if (url === "https://offline.invalid/api/cron/blog-export") {
    if (options.method === "POST") {
      // Stubben ER HQ-ruten: kald den rigtige gate med det, udgiveren POSTer.
      const body = JSON.parse(options.body ?? "{}");
      posted.push(body);
      try {
        const row = await confirmPublished(
          db,
          body.id,
          body.url,
          async () => new Response(liveHtml, { status: 200 }),
          { revision: body.revision, releaseSha: body.releaseSha },
        );
        return Response.json({ ok: true, url: row.url });
      } catch (e) {
        return Response.json({ ok: false, error: e.message }, { status: 409 });
      }
    }
    return Response.json({ ...exportedData, ok: true, items });
  }
  if (/^https:\/\/fixture.invalid\/[ab]\.png$/.test(url)) return new Response(Buffer.from("synthetic image bytes"), { headers: { "content-type": "image/png" } });
  if (phase === "verify") return new Response(liveHtml, { status: 200, headers: { "content-type": "text/html" } });
  throw new Error(`Offline fetch refused: ${url}`);
};
console.log = (...args) => logs.push(args.join(" "));
process.env.HQ_URL = "https://offline.invalid";
process.env.BLOG_EXPORT_SECRET = "synthetic-not-a-real-secret";
const publisher = pathToFileURL(`${site}/scripts/blog-publish.mjs`).href;
const bare = `${base}/origin.git`;
const dir = mkdtempSync(`${base}/synthetic-site-`);
const g = (...args) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
const gout = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
execFileSync("git", ["init", "--bare", "-b", "main", bare], { stdio: "ignore" });
execFileSync("git", ["init", "-b", "main", "."], { cwd: dir, stdio: "ignore" });
g("remote", "add", "origin", bare);
mkdirSync(`${dir}/content/blog`, { recursive: true });
mkdirSync(`${dir}/public`, { recursive: true });
writeFileSync(`${dir}/content/blog/index.ts`, 'import { post as fixture } from "./fixture";\nexport const blogPosts: BlogPost[] = [\n  fixture,\n];\n');
writeFileSync(`${dir}/public/.gitkeep`, "");
g("add", ".");
g("-c", "user.name=Synthetic", "-c", "user.email=synthetic@invalid", "commit", "-m", "init");
g("push", "-u", "origin", "main");
process.chdir(dir);
process.argv = ["node", publisher, "prepare"];

await check("actual_export_validates_and_writes_selected_assets", async () => {
  await import(`${publisher}?offline=1`);
  const raw = readFileSync(`content/blog/${p.slug}.ts`, "utf8");
  assert.equal(JSON.parse(raw.slice(raw.indexOf("= ") + 2, raw.lastIndexOf(";"))).slug, p.slug);
  assert.equal(exported.files.length, 3, "hero + OG-udsnit + billede i brødteksten");
});

await check("duplicate_export_no_diff", async () => {
  const paths = [`content/blog/${p.slug}.ts`, "content/blog/index.ts", ".blog-pending.json"];
  const before = paths.map((x) => readFileSync(x, "utf8"));
  await import(`${publisher}?offline=2`);
  assert.deepEqual(paths.map((x) => readFileSync(x, "utf8")), before);
});

await check("release_manifest_preserves_revision", async () => {
  const manifest = JSON.parse(readFileSync(".blog-pending.json", "utf8"));
  assert.equal(manifest[0].revision, exported.revision, "publisher discards revision, pending has only id/url");
  assert.equal(manifest[0].id, exported.id);
  assert.equal(manifest[0].url, `https://kinly.dk/blog/${p.slug}/`);
});

await check("empty_queue_silent_zero_writes", async () => {
  items = [];
  logs.length = 0;
  const before = readFileSync(".blog-pending.json", "utf8");
  await import(`${publisher}?offline=3`);
  assert.equal(logs.length, 0, `empty queue prints ${JSON.stringify(logs)}`);
  assert.equal(readFileSync(".blog-pending.json", "utf8"), before);
});

await check("empty_queue_does_not_overwrite_pending_manifest", async () => {
  assert.notEqual(readFileSync(".blog-pending.json", "utf8"), "[]", "empty export overwrites a non-empty pending release manifest");
});

await check("gated_live_confirm_uses_the_humans_merge_sha_and_revision", async () => {
  // Lucas merger grenen — dét er release-beviset: en commit på main der rører
  // manifestet. verify læser den, henter live-siden og POSTer beviset til den
  // RIGTIGE HQ-gate (stubben kalder confirmPublished).
  g("checkout", "main");
  g("-c", "user.name=Lucas Buur", "-c", "user.email=buur.aigro@gmail.com", "merge", "--no-ff", "blog-publish", "-m", "blog: udgiv fra Kinly HQ (menneskelig merge)");
  const mergeSha = gout("rev-parse", "HEAD");
  g("push", "origin", "main");
  liveHtml = `<h1>${p.title}</h1><article>${p.body}</article>`;
  phase = "verify";
  process.argv = ["node", publisher, "verify"];
  await import(`${publisher}?offline=live`);
  assert.equal(posted.length, 1, "verify POSTer præcis én gang");
  assert.equal(posted[0].releaseSha, mergeSha, "release-beviset er menneskets merge-sha, ikke en opdigtet streng");
  assert.equal(posted[0].revision, exported.revision, "revisionen bevares gennem hele kæden");
  assert.equal((await getPost(db, p.id)).stage, "udgivet", "HQ-gaten flyttede kortet til Udgivet");
});

console.log = realLog;
process.chdir(cwd);
process.argv = argv;
globalThis.fetch = realFetch;

const fakeLive = async () => new Response(`<h1>${p.title}</h1>`, { status: 200 });

await check("gated_release_requires_separate_human_release_proof", async () => {
  await assert.rejects(
    confirmPublished(db, p.id, `https://kinly.dk/blog/${p.slug}/`, fakeLive),
    /release|revision|godkend/i,
    "200+title without release proof must not mark published",
  );
});

await check("duplicate_live_confirm_rejected", async () => {
  // Eget kort: e2e-chekken har allerede brugt p.
  const q2 = await green("Syntetisk kort til gentaget bekræftelse");
  const url2 = `https://kinly.dk/blog/${q2.slug}/`;
  const live2 = async () => new Response(`<h1>${q2.title}</h1>`, { status: 200 });
  const proof2 = { revision: revisionOf(q2), releaseSha: "a".repeat(40) };
  const done = await confirmPublished(db, q2.id, url2, live2, proof2);
  assert.equal(done.stage, "udgivet");
  await assert.rejects(confirmPublished(db, q2.id, url2, live2, proof2), /ikke i Publicer/);
});

await check("changed_export_revision_rejected_after_human_recheck", async () => {
  const q = await green("Syntetisk revisionskontrakt uden udgivelse");
  const old = (await exportablePosts(db)).items.find((x) => x.id === q.id);
  assert.ok(old);
  await updatePost(db, q.id, { stage: "klar" }, "charlie");
  const changed = await updatePost(db, q.id, { body: `${q.body}\n\nEn ændret syntetisk sætning.`, proofs: { factcheck: { note: "new offline human check" } } }, "charlie");
  assert.notEqual(revisionOf(changed), old.revision);
  await updatePost(db, q.id, { stage: "publicer" }, "charlie");
  await assert.rejects(
    confirmPublished(db, q.id, `https://kinly.dk/blog/${q.slug}/`, async () => new Response(`<h1>${q.title}</h1>`, { status: 200 }), {
      revision: old.revision,
      releaseSha: "a".repeat(40),
    }),
    /revision|release|ændret/i,
    "stale live body with same title is incorrectly accepted",
  );
});

await check("workflow_stages_private_pr_not_main_push", async () => {
  const yml = readFileSync(`${site}/.github/workflows/blog-publish.yml`, "utf8");
  const pushLines = yml.split("\n").filter((l) => /\bgit push\b/.test(l));
  assert.ok(pushLines.every((l) => /blog-publish/.test(l)), `workflowet må kun pushe blog-publish: ${pushLines.join(" | ")}`);
  assert.ok(yml.includes("blog-publish.mjs prepare"), "workflow skal klargøre på en privat gren");
});

const report = {
  verdict: findings.every((x) => x.pass) ? "GODKENDT" : "AFVIST",
  scope: "offline existing-chain characterization; no HQ/live writes",
  findings,
  interceptedRequests: requests,
  actualNetworkRequests: 0,
};
writeFileSync(`${base}/contract-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.verdict === "GODKENDT" ? 0 : 1;
