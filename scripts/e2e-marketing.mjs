#!/usr/bin/env node
// E2E for /marketing, som Lucas og Charlie bruger det: klik, tastatur, reload, tilbage-knap.
//   node scripts/e2e-marketing.mjs http://localhost:3041 <out-dir>
// Kører hele rækken to gange: desktop 1440 og mobil 390. Exit 1 ved enhver fejl.
// Mod en lokal pglite-DB (1 forbindelse): alt kører sekventielt. Testdata får et unikt mærke
// ("E2E-<mærke>") og slettes ikke (drop er en status). Kør kun mod localhost.
import { chromium } from "playwright";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const BASE = (process.argv[2] ?? "http://localhost:3041").replace(/\/$/, "");
const OUT = path.resolve(process.argv[3] ?? "./e2e-marketing-out");
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("Kører kun mod localhost (testen opretter data).");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "desktop", viewport: { width: 1440, height: 900 }, mobile: false },
  { name: "mobil", viewport: { width: 390, height: 844 }, mobile: true },
];
const PAGES = [
  ["Tragt", "/marketing"], ["Kladder", "/marketing/kladder"], ["Kalender", "/marketing/kalender"], ["Hooks", "/marketing/hooks"],
  ["A/B-tests", "/marketing/tests"], ["Måling", "/marketing/maaling"], ["Inspiration", "/marketing/inspiration"], ["Musik", "/marketing/musik"],
];

// ---------------------------------------------------------------- harness

const SHELL_POLL = /\/api\/(opmaerksomhed|deck\/counts|review\/halt-all)/;
const R = { steps: 0, failures: [], issues: [], notes: [] };
let page, vp, current = "start", allow = [], tolerate400 = false;
const log = (s) => console.log(s);
const slug = (s) => s.replace(/[^a-z0-9æøå]+/gi, "-").slice(0, 60);

async function shot(name) {
  try { await page.screenshot({ path: path.join(OUT, `${vp.name}-${slug(name)}.png`), fullPage: true, scale: "css" }); } catch { /* siden kan være lukket */ }
}
async function step(name, fn) {
  R.steps++;
  current = `${vp.name}: ${name}`;
  tolerate400 = /^server:|server-race|ugyldige værdier|afvises/.test(name); // trin der med vilje sender ugyldige kald
  try {
    await fn();
    log(`ok    ${current}`);
  } catch (e) {
    const msg = String(e?.message ?? e).split("\n").slice(0, 6).join(" | ");
    R.failures.push({ step: current, error: msg });
    log(`FEJL  ${current}\n      ${msg}`);
    await shot(`FEJL-${name}`);
  }
}
function must(cond, msg) { if (!cond) throw new Error(msg); }
function eq(actual, expected, what) { if (actual !== expected) throw new Error(`${what}: forventede ${JSON.stringify(expected)}, fik ${JSON.stringify(actual)}`); }

/** Et bevidst 4xx/5xx: kører fn og kræver, at det kom (så det ikke tæller som fejl). */
async function expectBad(status, urlRe, fn) {
  const a = { status, urlRe, hits: 0 };
  allow.push(a);
  try { await fn(); } finally { allow = allow.filter((x) => x !== a); }
  must(a.hits > 0, `forventede HTTP ${status} fra ${urlRe}, men den kom ikke`);
}
function attach(p) {
  p.on("response", (r) => {
    const s = r.status();
    if (s < 400) return;
    const hit = allow.find((a) => a.status === s && a.urlRe.test(r.url()));
    if (hit) { hit.hits++; return; }
    if (tolerate400 && (s === 400 || s === 409) && /\/api\/marketing/.test(r.url())) return;
    R.issues.push({ where: current, kind: `http ${s}`, text: `${r.request().method()} ${r.url().replace(BASE, "")}` });
  });
  p.on("console", (m) => {
    if (m.type() !== "error" && m.type() !== "warning") return;
    const t = m.text();
    if (/Failed to load resource/.test(t)) return; // dækkes af response-lytteren
    if (m.type() === "warning" && !/hydrat|key|Warning:/i.test(t)) return;
    R.issues.push({ where: current, kind: `console.${m.type()}`, text: t.slice(0, 300) });
  });
  p.on("pageerror", (e) => R.issues.push({ where: current, kind: "pageerror", text: String(e).slice(0, 300) }));
  p.on("requestfailed", (r) => {
    const f = r.failure()?.errorText ?? "";
    if (/ERR_ABORTED/.test(f) || SHELL_POLL.test(r.url())) return; // navigation midt i en hentning / blokeret skal-polling
    R.issues.push({ where: current, kind: "requestfailed", text: `${r.method()} ${r.url().replace(BASE, "")} ${f}` });
  });
}

// ---------------------------------------------------------------- små værktøjer

const cph = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen" }).format(new Date());
const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dk = (iso) => iso.split("-").reverse().join(""); // 2026-10-16 → 16102026 (da-DK: dag, måned, år)
const mondayOf = (iso) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };

async function settle() {
  await page.waitForLoadState("domcontentloaded");
  await page.locator("h1").first().waitFor();
  // Next dev holder forbindelser åbne, så "networkidle" aldrig kommer: vent i stedet på at React har hydreret siden.
  await page.waitForFunction(() => { const el = document.querySelector(".kinly-page"); return !!el && Object.keys(el).some((k) => k.startsWith("__reactFiber")); }, null, { timeout: 15000 }).catch(() => {});
}
const tabLink = (name) => page.locator('nav[aria-label="Undersider"]').getByRole("link", { name, exact: true });
async function goTab(name, urlPart) {
  await tabLink(name).click();
  await page.waitForURL((u) => u.pathname === urlPart || u.pathname === urlPart + "/", { timeout: 15000 });
  await settle();
}
async function open(urlPath) { await page.goto(BASE + urlPath, { waitUntil: "domcontentloaded" }); await settle(); }
const card = (title) => page.locator("article.mk-draft").filter({ hasText: title }).first();
const field = (scope, label) => scope.locator(".mk-field").filter({ has: page.locator(".mk-label", { hasText: label }) }).locator("input, select, textarea").first();
const btn = (scope, name) => scope.getByRole("button", { name, exact: true });
const nfToNum = (s) => (s.trim() === "–" ? null : Number(s.replace(/\./g, "").replace(",", ".")));

/** Afkrydsning der gemmes på serveren: feltet skifter først, når svaret er kommet, så Playwrights check() er for strengt. */
async function tick(loc, want = true) {
  if ((await loc.isChecked()) !== want) await loc.click();
  for (let i = 0; i < 60; i++) { if ((await loc.isChecked()) === want) return; await page.waitForTimeout(150); }
  throw new Error(`afkrydsningen blev ikke ${want ? "sat" : "fjernet"} (gemmes den ikke?)`);
}

/** POST /api/marketing fra siden (samme Origin som en rigtig bruger). */
const api = (body) => page.evaluate(async (b) => {
  const r = await fetch("/api/marketing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
  return { status: r.status, json: await r.json().catch(() => null) };
}, body);

async function readFunnel() {
  return page.$$eval(".mk-step", (els) => els.map((e) => ({ label: e.querySelector(".mk-step-label")?.childNodes[0]?.textContent ?? "", val: (e.querySelector(".mk-step-val")?.childNodes[0]?.textContent ?? "").trim(), pct: e.querySelector(".mk-step-pct")?.textContent ?? "" })))
    .then((rows) => rows.map((r) => ({ ...r, n: nfToNum(r.val) })));
}
async function readTodo() {
  const t = await page.$$eval(".mk-todo-n", (els) => els.map((e) => Number(e.textContent)));
  return { waiting: t[0], noDate: t[1], running: t[2] };
}

// ---------------------------------------------------------------- sidetjek (alle sider)

async function pageHealth(label) {
  await settle();
  const info = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth; // ikke innerWidth: vandret overløb får mobil til at zoome layout-viewporten ud
    const root = document.querySelector(".kinly-page") ?? document.body;
    const scroller = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll") return true; } return false; };
    const closedDetails = (el) => { const d = el.closest("details:not([open])"); return !!d && !el.closest("summary"); };
    const visible = (el) => { if (closedDetails(el)) return false; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
    const doc = document.documentElement;
    const hscroll = Math.max(doc.scrollWidth, document.body.scrollWidth) - vw;
    const wide = [...root.querySelectorAll("*")].filter((el) => visible(el) && !scroller(el) && el.getBoundingClientRect().right > vw + 1).slice(0, 5).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} right=${Math.round(el.getBoundingClientRect().right)}`);
    const ctl = [...root.querySelectorAll("a[href], button, input, select, textarea, summary")].filter((el) => visible(el) && !scroller(el)).map((el) => ({ el, r: el.getBoundingClientRect() }));
    const name = (el) => (el.textContent || el.getAttribute("aria-label") || el.id || "").trim().slice(0, 25);
    const over = [];
    for (let i = 0; i < ctl.length && over.length < 5; i++) for (let j = i + 1; j < ctl.length && over.length < 5; j++) {
      const a = ctl[i], b = ctl[j];
      if (a.r.top > b.r.bottom || b.r.top > a.r.bottom) continue;
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (w > 3 && h > 3) over.push(`${a.el.tagName.toLowerCase()}"${name(a.el)}" x ${b.el.tagName.toLowerCase()}"${name(b.el)}"`);
    }
    return { hscroll, wide, over };
  });
  await page.addScriptTag({ content: axeSource }).catch(() => {});
  const axe = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const res = await axe.run({ exclude: [["nextjs-portal"]] }, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } });
    return res.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, ex: v.nodes.slice(0, 2).map((n) => n.target.join(" ").slice(0, 80)) }));
  });
  await shot(label);
  const probs = [];
  if (info.hscroll > 1) probs.push(`vandret scroll ${info.hscroll}px`);
  if (info.wide.length) probs.push(`udenfor skærmen: ${info.wide.join("; ")}`);
  if (info.over.length) probs.push(`overlap: ${info.over.join("; ")}`);
  for (const v of axe) probs.push(`axe ${v.id} (${v.impact}, ${v.n}x) ${v.ex.join(" | ")}`);
  if (probs.length) throw new Error(probs.join(" || "));
}

// ---------------------------------------------------------------- flows

async function runViewport(def, browser) {
  vp = def;
  const tag = `${(Date.now() % 1e8).toString(36)}${def.mobile ? "m" : "d"}`;
  const ctx = await browser.newContext({
    viewport: def.viewport, locale: "da-DK", timezoneId: "Europe/Copenhagen", isMobile: def.mobile, hasTouch: def.mobile, deviceScaleFactor: def.mobile ? 2 : 1,
  });
  ctx.setDefaultTimeout(15000);
  // Skallens baggrundskald (opmærksomhed, tællere, pause-status) går mod den samme lokale pglite-forbindelse
  // som siden og gør hvert skrive-kald 15-30 s langsomt. De hører ikke til /marketing: blokeres her.
  await ctx.route(SHELL_POLL, (r) => r.abort());
  page = await ctx.newPage();
  attach(page);
  const today = cph();
  const S = { tag };
  const T = (s) => `E2E-${tag} ${s}`;

  // ============ 0. Alle sider: sundhed (konsol, 4xx/5xx, axe, vandret scroll, overlap)
  await step("start: åbner /marketing", async () => { await open("/marketing"); eq(await page.title(), "Marketing · Kinly HQ", "titel"); });
  for (const [name, p] of PAGES) {
    await step(`side ${name}: sundhed (konsol, http, axe wcag2aa, scroll, overlap)`, async () => { await open(p); await pageHealth(`side-${name}`); });
  }

  // ============ 1. Tragt: tom tilstand
  await step("tragt: viser tragt og 'Til dig nu'", async () => {
    await open("/marketing");
    must((await page.locator(".mk-step").count()) === 4, "tragten skal have 4 trin");
    S.f0 = await readFunnel();
    S.todo0 = await readTodo();
    const empty = S.f0.every((s) => s.n == null);
    if (empty) {
      must(await page.getByText("Ingen målinger endnu.").isVisible(), "tom tilstand mangler beskeden 'Ingen målinger endnu'");
      must(S.f0.every((s) => s.val === "–"), "tomme trin skal vise –");
    } else R.notes.push(`${vp.name}: tragten var ikke tom ved start (data fra tidligere kørsel) — tom-tilstand ikke testet denne gang`);
    S.empty0 = empty;
  });

  // ============ 2. Kladder: liste, spor, filtre
  await step("kladder: fane, spor og filtre", async () => {
    await goTab("Kladder", "/marketing/kladder");
    for (const n of [/^Faceless/, /^Lucas \+ Charlie/, /^Dag N/]) must(await page.getByRole("button", { name: n }).isVisible(), `sporknap ${n} mangler`);
    eq(await page.getByRole("button", { name: "Aktive", exact: true }).getAttribute("aria-pressed"), "true", "Aktive valgt som standard");
    const aktive = await page.locator("article.mk-draft").count();
    const label = await page.getByRole("button", { name: /^Faceless/ }).innerText();
    must(aktive > 0, "ingen kladder på Faceless");
    S.facelessActive = aktive;
    for (const [f, st] of [["Kladder", "Kladde"], ["Godkendt", "Godkendt"], ["Postet", "Postet"], ["Droppet", "Droppet"]]) {
      await page.getByRole("button", { name: f, exact: true }).click();
      const chips = await page.locator("article.mk-draft").evaluateAll((els) => els.map((e) => e.getAttribute("data-status")));
      must(chips.every((c) => c === st.toLowerCase()), `filter ${f} viser andre statusser: ${[...new Set(chips)]}`);
      if (chips.length === 0) must(await page.getByText("Ingen kladder her.").isVisible(), `tomt filter ${f} mangler tom-besked`);
    }
    await page.getByRole("button", { name: "Aktive", exact: true }).click();
    R.notes.push(`${vp.name}: sporknap viser "${label.replace(/\s+/g, " ")}", ${aktive} aktive kort`);
  });
  await step("kladder: spor Lucas + Charlie viser Fase 2-advarsel og noter", async () => {
    await page.getByRole("button", { name: /^Lucas \+ Charlie/ }).click();
    must(await page.getByText("Fase 2. Kræver Charlies ja", { exact: false }).first().isVisible(), "duo-note mangler");
    const n = await page.locator("article.mk-draft").count();
    must(n > 0, "duo-sporet har ingen kort");
    must((await page.locator("article.mk-draft .mk-chip-warn", { hasText: "Fase 2" }).count()) === n, "ikke alle duo-kort har Fase 2-chip");
    await page.getByRole("button", { name: /^Faceless/ }).click();
  });

  // ============ 7/8. Ny kladde fra bunden (æøå, emoji, lang tekst)
  await step("ny kladde: tom titel kan ikke gemmes", async () => {
    await page.getByRole("button", { name: "+ Ny kladde" }).click();
    const form = page.locator("form").filter({ has: page.getByRole("heading", { name: "Ny kladde" }) });
    must(await btn(form, "Gem som kladde").isDisabled(), "Gem skal være slået fra uden titel");
    await field(form, "Titel").fill("   ");
    must(await btn(form, "Gem som kladde").isDisabled(), "Gem skal være slået fra med kun mellemrum");
    await btn(form, "Annullér").click();
  });
  await step("ny kladde: opret med æøå, emoji og [N]-hook, vises uden at man skal lede", async () => {
    S.t1 = T("Ældre ørred på åen 🚀🇩🇰");
    await page.getByRole("button", { name: "+ Ny kladde" }).click();
    const form = page.locator("form").filter({ has: page.getByRole("heading", { name: "Ny kladde" }) });
    await field(form, "Titel").fill(S.t1);
    await field(form, "Hook").fill("[N] ting jeg ville ønske, jeg vidste om hjemmesider ✨");
    await btn(form, "Gem som kladde").click();
    const c = card(S.t1);
    await c.waitFor();
    must(await page.getByRole("button", { name: "+ Ny kladde" }).isVisible(), "formularen lukkede ikke efter gem");
    const box = await c.boundingBox();
    const h = await page.evaluate(() => window.innerHeight);
    const pos = await c.evaluate((el) => { const all = [...document.querySelectorAll("article.mk-draft")]; return [all.indexOf(el), all.length]; });
    R.notes.push(`${vp.name}: ny kladde står som kort nr. ${pos[0] + 1} af ${pos[1]}, top=${Math.round(box.y)}px (skærm ${h}px)`);
    must(box.y < h * 2, `den nye kladde ligger langt nede (kort ${pos[0] + 1} af ${pos[1]}); brugeren ser ikke, at den blev lavet`);
  });
  await step("ny kladde: pladsholder [N] advarer og blokerer godkend", async () => {
    const c = card(S.t1);
    must(await c.getByText("pladsholder", { exact: false }).first().isVisible(), "ingen advarsel om [N]");
    must(await btn(c, "Godkend").isDisabled(), "Godkend skal være slået fra");
  });
  await step("ny kladde: en kladde i et andet spor end det viste dukker op", async () => {
    S.t2 = T("Duo-idé om kaffe ☕");
    await page.getByRole("button", { name: "+ Ny kladde" }).click();
    const form = page.locator("form").filter({ has: page.getByRole("heading", { name: "Ny kladde" }) });
    await field(form, "Titel").fill(S.t2);
    await field(form, "Hook").fill("Vi lavede en hjemmeside på én dag");
    await field(form, "Spor").selectOption("duo");
    await btn(form, "Gem som kladde").click();
    await page.waitForTimeout(600);
    must(await card(S.t2).isVisible(), "kladden blev lavet i sporet Lucas + Charlie, men vises ikke — brugeren ser kun at formularen forsvinder");
  });

  // ============ 2. Ret, lang tekst, reload midt i redigering
  await step("ret: indhold, lang tekst og emoji gemmes og står rigtigt efter reload", async () => {
    await page.getByRole("button", { name: /^Faceless/ }).click();
    const c = card(S.t1);
    await btn(c, "Ret").click();
    const form = c.locator("form");
    await field(form, "Hook").fill("3 ting jeg ville ønske, jeg vidste om hjemmesider ✨ æøå ÆØÅ");
    S.longScript = ("Linje med æøå og emoji 🎬 — ".repeat(40) + "\n").repeat(25); // ~25 linjer à ~1000 tegn
    await field(form, "Manus").fill(S.longScript);
    await field(form, "Billedtekst").fill("Gem den her 👇 #kinly #hjemmeside");
    await field(form, "Længde i sekunder").fill("62");
    await btn(form, "Gem rettelser").click();
    await c.locator("form").waitFor({ state: "detached" });
    must(await c.getByText("3 ting jeg ville ønske, jeg vidste om hjemmesider ✨ æøå ÆØÅ").first().isVisible(), "hooket blev ikke opdateret");
    await page.reload(); await settle();
    const c2 = card(S.t1);
    must(await c2.getByText("3 ting jeg ville ønske", { exact: false }).first().isVisible(), "hooket er væk efter reload");
    must(await c2.getByText("62 sek.").isVisible(), "længde 62 sek. mangler efter reload");
    await c2.locator("summary", { hasText: "Manus, billedtekst og noter" }).click();
    must(await c2.getByText("Gem den her 👇 #kinly #hjemmeside").isVisible(), "billedtekst med emoji mangler");
  });
  await step("ret: reload midt i redigering mister kun det uafsendte, intet går i stykker", async () => {
    const c = card(S.t1);
    await btn(c, "Ret").click();
    await field(c.locator("form"), "Titel").fill(T("HALV RETTELSE"));
    await page.reload(); await settle();
    must(await card(S.t1).isVisible(), "kladden står ikke som før efter reload");
    must(!(await page.getByText("HALV RETTELSE").count()), "uafsendt tekst blev gemt alligevel");
  });
  await step("ret: for lang titel afvises ikke stille (maxlength i feltet)", async () => {
    const c = card(S.t1);
    await btn(c, "Ret").click();
    const t = field(c.locator("form"), "Titel");
    await t.fill("X".repeat(400));
    const len = (await t.inputValue()).length;
    must(len <= 300, `titelfeltet tager ${len} tegn (max skal være 300)`);
    await btn(c.locator("form"), "Annullér").click();
  });
  await step("ret: tom titel kan ikke gemmes", async () => {
    const c = card(S.t1);
    await btn(c, "Ret").click();
    await field(c.locator("form"), "Titel").fill("");
    must(await btn(c.locator("form"), "Gem rettelser").isDisabled(), "Gem skal være slået fra uden titel");
    await btn(c.locator("form"), "Annullér").click();
  });
  await step("ret: tegn der kan knække layout (ubrudt tekst) overløber ikke på skærmen", async () => {
    const c = card(S.t1);
    await btn(c, "Ret").click();
    await field(c.locator("form"), "Hook").fill("A".repeat(580));
    await field(c.locator("form"), "Billedtekst").fill("https://example.com/" + "b".repeat(300));
    await btn(c.locator("form"), "Gem rettelser").click();
    await c.locator("form").waitFor({ state: "detached" });
    await c.locator("summary", { hasText: "Manus, billedtekst og noter" }).click();
    await pageHealth("lang-ubrudt-tekst");
    await btn(c, "Ret").click();
    await field(c.locator("form"), "Hook").fill("3 ting jeg ville ønske, jeg vidste om hjemmesider ✨");
    await btn(c.locator("form"), "Gem rettelser").click();
    await c.locator("form").waitFor({ state: "detached" });
  });

  // ============ 2. Godkend: gates
  await step("godkend: sandt-dato mangler → Godkend slået fra og forklaring vises", async () => {
    const c = card(S.t1);
    must(await btn(c, "Godkend").isDisabled(), "Godkend skal være slået fra uden sandt-dato");
    must(await c.getByText("Sandt i dag", { exact: false }).first().isVisible(), "forklaring om 'Sandt i dag' mangler");
  });
  await step("godkend: 'Tjek og lyd' → I dag → Godkend (dobbeltklik giver ingen fejl)", async () => {
    const c = card(S.t1);
    await c.locator("summary", { hasText: "Tjek og lyd" }).click();
    await btn(c, "I dag").click();
    await c.getByText("Tjekket som sandt den", { exact: false }).waitFor();
    await btn(c, "Godkend").dblclick();
    await c.locator(".cc-chip", { hasText: "Godkendt" }).waitFor();
    await page.waitForTimeout(400);
    must((await c.locator(".mk-err").count()) === 0, `fejlbesked efter dobbeltklik: ${await c.locator(".mk-err").first().innerText().catch(() => "")}`);
    await page.reload(); await settle();
    must(await card(S.t1).locator(".cc-chip", { hasText: "Godkendt" }).isVisible(), "status Godkendt overlevede ikke reload");
  });
  await step("godkend: to samtidige godkend-kald giver ét 200 og ingen 500 (server-race)", async () => {
    const r = await api({ action: "draftCreate", draft: { title: T("race"), hook: "Race hook" } });
    eq(r.status, 200, "opret race-kladde");
    const did = r.json.draft.id;
    eq((await api({ action: "draftChecks", id: did, checks: { trueCheckedOn: today } })).status, 200, "sandt-dato");
    const both = await page.evaluate(async (i) => {
      const go = () => fetch("/api/marketing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "draftAction", id: i, op: "approve" }) }).then((x) => x.status);
      return Promise.all([go(), go()]);
    }, did);
    must(both.every((s) => s !== 500), `server gav 500: ${both}`);
    must(both.includes(200), `ingen af to godkend-kald lykkedes: ${both}`);
    R.notes.push(`${vp.name}: to samtidige godkend → ${both.join(" + ")}`);
  });
  await step("godkend: Charlies ja på duo-spor (gate) og kundens ja på kundecase", async () => {
    await page.getByRole("button", { name: /^Lucas \+ Charlie/ }).click();
    const c = card(S.t2);
    await c.locator("summary", { hasText: "Tjek og lyd" }).click();
    await btn(c, "I dag").click();
    await c.getByText("Tjekket som sandt den", { exact: false }).waitFor();
    must(await btn(c, "Godkend").isDisabled(), "duo-kladde uden Charlies ja kunne godkendes");
    must(await c.getByText("Charlie skal have sagt ja", { exact: false }).first().isVisible(), "forklaring om Charlies ja mangler");
    await tick(c.getByLabel("Charlie har sagt ja", { exact: false }));
    await c.getByText("Kladde", { exact: true }).first().waitFor();
    await page.waitForTimeout(300);
    must(await btn(c, "Godkend").isEnabled(), "Godkend skal være slået til efter Charlies ja");
    // kundecase: sæt i Ret-formularen
    await btn(c, "Ret").click();
    await tick(c.locator("form").getByLabel("Det er en kundecase", { exact: false }));
    await btn(c.locator("form"), "Gem rettelser").click();
    await c.locator("form").waitFor({ state: "detached" });
    must(await btn(c, "Godkend").isDisabled(), "kundecase uden kundens ja kunne godkendes");
    must(await c.getByText("Kundens skriftlige ok mangler", { exact: false }).first().isVisible(), "forklaring om kundens ok mangler");
    await c.locator("summary", { hasText: "Tjek og lyd" }).click();
    await tick(c.getByLabel("Kunden har sagt ja", { exact: false }));
    await page.waitForTimeout(300);
    must(await btn(c, "Godkend").isEnabled(), "Godkend skal være slået til efter kundens ja");
    await btn(c, "Godkend").click();
    await c.locator(".cc-chip", { hasText: "Godkendt" }).waitFor();
  });
  await step("godkend: fjernes Charlies ja på en godkendt duo-kladde, falder den tilbage til kladde", async () => {
    const c = card(S.t2);
    await c.locator("details").evaluateAll((ds) => ds.forEach((d) => { d.open = true; }));
    await tick(c.getByLabel("Charlie har sagt ja", { exact: false }), false);
    await c.locator(".cc-chip", { hasText: "Kladde" }).waitFor();
    await tick(c.getByLabel("Charlie har sagt ja", { exact: false }));
    await page.waitForTimeout(300);
  });

  // ============ 6. Musik-licens-vagt
  await step("musik: licenseret + 'ukendt' → kan ikke godkendes; 'erhverv-ok' → kan", async () => {
    await page.getByRole("button", { name: /^Faceless/ }).click();
    S.t3 = T("Musikvagt");
    const r = await api({ action: "draftCreate", draft: { title: S.t3, hook: "Hook uden pladsholder", track: "faceless" } });
    eq(r.status, 200, "opret");
    await page.reload(); await settle();
    const c = card(S.t3);
    await btn(c, "Ret").click();
    const f = c.locator("form");
    await field(f, "Lyd").selectOption("licenseret");
    await field(f, "Licens").fill("ukendt");
    await field(f, "Hvilket nummer").fill("Test-nummer fra Epidemic 🎵");
    await btn(f, "Gem rettelser").click();
    await f.waitFor({ state: "detached" });
    await c.locator("summary", { hasText: "Tjek og lyd" }).click();
    await btn(c, "I dag").click();
    await c.getByText("Tjekket som sandt den", { exact: false }).waitFor();
    must(await btn(c, "Godkend").isDisabled(), "licens 'ukendt' kunne godkendes");
    must(await c.getByText("erhverv-ok", { exact: false }).first().isVisible(), "forklaring om licens mangler");
    // Musik-siden viser licensen i rødt
    await goTab("Musik", "/marketing/musik");
    const row = page.locator("tr", { hasText: S.t3 });
    must(await row.isVisible(), "kladden med licenseret musik står ikke på Musik-siden");
    must(await row.locator("strong.mk-err", { hasText: "ukendt" }).isVisible(), "ukendt licens vises ikke som advarsel");
    await goTab("Kladder", "/marketing/kladder");
    const c2 = card(S.t3);
    await btn(c2, "Ret").click();
    await field(c2.locator("form"), "Licens").fill("erhverv-ok");
    await btn(c2.locator("form"), "Gem rettelser").click();
    await c2.locator("form").waitFor({ state: "detached" });
    must(await btn(c2, "Godkend").isEnabled(), "licens erhverv-ok burde kunne godkendes");
  });
  await step("musik: 'trending lyd' findes ikke som valg og afvises af serveren", async () => {
    await page.getByRole("button", { name: /^Faceless/ }).click();
    await btn(card(S.t3), "Ret").click();
    const texts = await field(card(S.t3).locator("form"), "Lyd").locator("option").allInnerTexts();
    must(!texts.some((t) => /trend/i.test(t)), `trending findes som valg: ${texts}`);
    await btn(card(S.t3).locator("form"), "Annullér").click();
    await expectBad(400, /\/api\/marketing/, async () => {
      const r = await api({ action: "draftCreate", draft: { title: T("trend"), musicKind: "trending lyd" } });
      eq(r.status, 400, "server skal afvise trending");
      must(/Trending/.test(r.json?.error ?? ""), `fejlteksten nævner ikke trending: ${r.json?.error}`);
    });
  });

  // ============ 2. Godkend → postet, drop/gendan, prioritet
  await step("godkend: Godkend → 'Jeg har lagt den ud' → Postet", async () => {
    const c = card(S.t3);
    await btn(c, "Godkend").click();
    await c.locator(".cc-chip", { hasText: "Godkendt" }).waitFor();
    must((await btn(c, "Jeg har lagt den ud").count()) === 1, "'Jeg har lagt den ud' mangler på godkendt kladde");
    await btn(c, "Jeg har lagt den ud").click();
    await page.getByRole("button", { name: "Postet", exact: true }).click();
    await card(S.t3).locator(".cc-chip", { hasText: "Postet" }).waitFor();
    must((await btn(card(S.t3), "Drop").count()) === 0 && (await btn(card(S.t3), "Ret").count()) === 0, "en postet kladde må ikke kunne rettes/droppes");
    await page.getByRole("button", { name: "Aktive", exact: true }).click();
  });
  await step("drop og hent tilbage: kladden forsvinder fra Aktive og kommer igen", async () => {
    const c = card(T("race"));
    await btn(c, "Drop").click();
    await c.waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Droppet", exact: true }).click();
    const d = card(T("race"));
    await d.waitFor();
    must(await d.locator(".cc-chip", { hasText: "Droppet" }).isVisible(), "droppet-chip mangler");
    await btn(d, "Hent tilbage").click();
    await d.waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Kladder", exact: true }).click();
    must(await card(T("race")).isVisible(), "kladden kom ikke tilbage som Kladde");
    await page.getByRole("button", { name: "Aktive", exact: true }).click();
  });
  await step("prioritet: Høj løfter kladden øverst og overlever reload", async () => {
    const c = card(S.t1);
    await field(c, "Prioritet").selectOption("1");
    await page.waitForTimeout(500);
    await page.reload(); await settle();
    const idx = await card(S.t1).evaluate((el) => [...document.querySelectorAll("article.mk-draft")].indexOf(el));
    must(await field(card(S.t1), "Prioritet").inputValue() === "1", "prioritet 1 blev ikke gemt");
    R.notes.push(`${vp.name}: efter prioritet Høj står kladden som kort nr. ${idx + 1}`);
    must(idx < 60, `kladden med Høj ligger som nr. ${idx + 1}`);
  });
  await step("drop/ret: godkendt kladde → ændret indhold sender den tilbage til kladde og nulstiller tjek", async () => {
    const c = card(S.t1);
    await btn(c, "Ret").click();
    await field(c.locator("form"), "Billedtekst").fill("Ny billedtekst, så den skal godkendes igen");
    await btn(c.locator("form"), "Gem rettelser").click();
    await c.locator("form").waitFor({ state: "detached" });
    await c.locator(".cc-chip", { hasText: "Kladde" }).waitFor();
    await c.locator("summary", { hasText: "Tjek og lyd" }).click();
    must((await field(c, "Sandt i dag").inputValue()) === "", "sandt-dato blev ikke nulstillet efter ændret indhold");
  });
  await step("godkend: ændring af kun egen note på en godkendt kladde beholder godkendelsen", async () => {
    const c = card(S.t1);
    await btn(c, "I dag").click().catch(() => {});
    await c.getByText("Tjekket som sandt den", { exact: false }).waitFor();
    await btn(c, "Godkend").click();
    await c.locator(".cc-chip", { hasText: "Godkendt" }).waitFor();
    await btn(c, "Ret").click();
    await field(c.locator("form"), "Egen note").fill("Kun en note, ingen ændring i videoen");
    await btn(c.locator("form"), "Gem rettelser").click();
    await c.locator("form").waitFor({ state: "detached" });
    must(await c.locator(".cc-chip", { hasText: "Godkendt" }).isVisible(), "godkendelsen røg, selvom kun noten blev ændret");
  });
  await step("godkend: en seedet kladde med manus kan rettes i noten uden at miste godkendelsen", async () => {
    // første seedede kladde med manus (har extKey og ikke vores mærke)
    const c = page.locator('article.mk-draft[data-status="kladde"]').filter({ hasNotText: "E2E-" }).filter({ has: page.locator("summary", { hasText: "Manus, billedtekst og noter" }) }).first();
    const title = (await c.locator(".mk-draft-title").innerText()).trim();
    S.seedTitle = title;
    await c.locator("details").evaluateAll((ds) => ds.forEach((d) => { d.open = true; }));
    const hookNow = await c.locator(".mk-hook").innerText().catch(() => "");
    const needsFix = /\[[^\]\n]{1,24}\]/.test(hookNow);
    if (needsFix) { await btn(c, "Ret").click(); await field(c.locator("form"), "Hook").fill("Rettet hook uden pladsholder"); await btn(c.locator("form"), "Gem rettelser").click(); await c.locator("form").waitFor({ state: "detached" }); }
    await btn(card(title), "I dag").click();
    await card(title).getByText("Tjekket som sandt den", { exact: false }).waitFor();
    const enabled = await btn(card(title), "Godkend").isEnabled();
    if (!enabled) { R.notes.push(`${vp.name}: seedet kladde "${title}" kunne ikke godkendes (mangler: ${(await card(title).locator(".mk-warn").first().innerText().catch(() => "")).replace(/\s+/g, " ")}) — springer note-test over`); return; }
    await btn(card(title), "Godkend").click();
    await card(title).locator(".cc-chip", { hasText: "Godkendt" }).waitFor();
    await btn(card(title), "Ret").click();
    await field(card(title).locator("form"), "Egen note").fill("E2E: kun note");
    await btn(card(title).locator("form"), "Gem rettelser").click();
    await card(title).locator("form").waitFor({ state: "detached" });
    must(await card(title).locator(".cc-chip", { hasText: "Godkendt" }).isVisible(), `seedet kladde "${title}" mistede godkendelsen ved at ændre kun noten (indhold sammenlignes ikke ens efter trim)`);
  });

  // ============ 3. Kalender
  await step("kalender: godkendt uden dato står under 'uden dato'", async () => {
    await goTab("Kalender", "/marketing/kalender");
    must(await page.locator(".mk-list .mk-row", { hasText: S.t1 }).isVisible(), "godkendt kladde (uden dato) står ikke i listen — Kalender viser forældede data?");
  });
  await step("kalender: sæt dato med tastaturet (dd mm åååå) giver præcis den dato", async () => {
    const row = page.locator(".mk-list .mk-row", { hasText: S.t1 });
    const target = addDays(today, 3);
    S.dateT1 = target;
    const posts = [];
    const onReq = (r) => { if (r.method() === "POST" && r.url().endsWith("/api/marketing")) posts.push(r.postData() ?? ""); };
    page.on("request", onReq);
    const input = row.locator('input[type="date"]');
    if (def.mobile) await input.fill(target);
    else { await input.focus(); await page.keyboard.type(dk(target), { delay: 40 }); }
    await page.waitForTimeout(1200);
    page.off("request", onReq);
    const saved = posts.map((p) => JSON.parse(p)?.draft?.plannedFor).filter(Boolean);
    must(saved.length >= 1, "ingen dato blev gemt");
    must(saved.every((d) => d === target), `kalenderen gemte forkerte datoer mens man skrev: ${JSON.stringify(saved)} (forventede kun ${target})`);
  });
  await step("kalender: datoen står i ugegitteret og ikke længere under 'uden dato'", async () => {
    await page.reload(); await settle();
    must(!(await page.locator(".mk-list .mk-row", { hasText: S.t1 }).count()), "kladden står stadig under 'uden dato'");
    const day = page.locator(".mk-cal-day").filter({ hasText: S.t1 });
    must(await day.count() === 1, "kladden står ikke i ugegitteret");
    must(await day.locator(".mk-cal-item").isVisible(), "kalenderpunktet er ikke synligt");
  });
  await step("kalender: flyt dato direkte i kalenderen", async () => {
    const item = page.locator(".mk-cal-item").filter({ hasText: S.t1 });
    const mover = item.locator('input[type="date"]');
    must((await mover.count()) === 1, "der er ingen måde at flytte en dato på i kalenderen (kun på Kladder)");
    const target = addDays(today, 5);
    S.dateT1 = target;
    const saved = page.waitForResponse((r) => /\/api\/marketing/.test(r.url()) && r.request().method() === "POST", { timeout: 10000 });
    await mover.fill(target);
    await saved;
    await page.reload(); await settle();
    const day = page.locator(".mk-cal-day").filter({ hasText: S.t1 });
    must(await day.locator(".mk-cal-dayname").innerText().then((t) => t.includes(String(Number(target.slice(8))) + ".")), "kladden står ikke på den flyttede dag");
  });
  await step("kalender: markér som postet direkte fra kalenderen", async () => {
    const item = page.locator(".mk-cal-item").filter({ hasText: S.t1 });
    const b = item.getByRole("button", { name: "Jeg har lagt den ud", exact: true });
    must((await b.count()) === 1, "kalenderen har ingen 'Jeg har lagt den ud' (kun på Kladder)");
    await b.click();
    await page.locator(".mk-cal-item").filter({ hasText: S.t1 }).filter({ hasText: "Postet" }).waitFor();
  });
  await step("kalender: plan fra før denne uge vises som advarsel (ikke tabt)", async () => {
    const past = addDays(mondayOf(today), -3);
    const r = await api({ action: "draftCreate", draft: { title: T("fortid"), hook: "Gammel plan", plannedFor: past } });
    eq(r.status, 200, "opret datokladde");
    await page.reload(); await settle();
    must(await page.locator(".mk-warn", { hasText: "Før denne uge" }).getByText(T("fortid"), { exact: false }).isVisible(), "plan i fortiden vises ikke");
  });
  await step("kalender: tastet dato på Kladder (Dato-feltet) gemmer kun den rigtige dato", async () => {
    await goTab("Kladder", "/marketing/kladder");
    const c = card(T("fortid"));
    const target = addDays(today, 9);
    const posts = [];
    const onReq = (r) => { if (r.method() === "POST" && r.url().endsWith("/api/marketing")) posts.push(r.postData() ?? ""); };
    page.on("request", onReq);
    const input = field(c, "Dato");
    if (def.mobile) await input.fill(target);
    else { await input.focus(); await page.keyboard.type(dk(target), { delay: 40 }); }
    await page.waitForTimeout(1200);
    page.off("request", onReq);
    const saved = posts.map((p) => JSON.parse(p)?.draft?.plannedFor).filter(Boolean);
    must(saved.length >= 1, "ingen dato blev gemt");
    must(saved.every((d) => d === target), `Dato-feltet gemte forkerte datoer mens man skrev: ${JSON.stringify(saved)} (forventede kun ${target})`);
    await page.reload(); await settle();
    eq(await field(card(T("fortid")), "Dato").inputValue(), target, "dato efter reload");
  });
  await step("kalender: tilbage-knappen fra Kalender til Kladder", async () => {
    await goTab("Kalender", "/marketing/kalender");
    await page.goBack();
    await settle();
    must(page.url().endsWith("/marketing/kladder"), `tilbage landede på ${page.url()}`);
    must((await page.locator("article.mk-draft").count()) > 0, "Kladder er tom efter tilbage");
  });

  // ============ 4. Måling
  await step("måling: tom formular, dato i dag, felter har etiketter", async () => {
    await goTab("Måling", "/marketing/maaling");
    eq(await page.getByLabel("Dato for opslaget").inputValue(), today, "dato for opslaget");
    must(await page.getByRole("button", { name: "Gem måling" }).isEnabled(), "Gem måling skal kunne trykkes");
  });
  await step("måling: tomme felter = ikke målt (ikke 0) — kun visninger", async () => {
    await page.locator("#m-views").fill("1200");
    await page.getByRole("button", { name: "Gem måling" }).click();
    await page.getByText("Målingen er gemt.").waitFor();
    const row = page.locator("tbody tr").first();
    const cells = await row.locator("td").allInnerTexts();
    eq(cells[3].trim(), "1.200", "visninger i tabellen");
    eq(cells[4].trim(), "–", "gemt = ikke målt");
    eq(cells[6].trim(), "–", "gem+del pr. 1000 uden gemt/delt");
  });
  await step("måling: tal (ikke tekst) for postet video; tabellen regner gem+del pr. 1000", async () => {
    await page.getByLabel("Hvilken video?").selectOption({ label: S.t3 });
    await page.locator("#m-views").fill("2000");
    await page.locator("#m-saves").fill("60");
    await page.locator("#m-shares").fill("40");
    await page.locator("#m-profileVisits").fill("25");
    await page.locator("#m-inquiries").fill("2");
    await page.locator("#m-note").fill("Målt kl. 20 æøå 📈");
    await page.getByRole("button", { name: "Gem måling" }).click();
    await page.getByText("Målingen er gemt.").waitFor();
    const cells = await page.locator("tbody tr").first().locator("td").allInnerTexts();
    eq(cells[3].trim(), "2.000", "visninger"); eq(cells[4].trim(), "60", "gemt"); eq(cells[5].trim(), "40", "delt");
    eq(cells[6].trim(), "50", "gem+del pr. 1000 (100/2000*1000)");
    eq(cells[7].trim(), "25", "profilbesøg"); eq(cells[8].trim(), "2", "henvendelser");
    S.measured = { views: 2000 + 1200, keep: 100, profile: 25, inq: 2 };
  });
  await step("måling: ugyldige værdier afvises (negativ, bogstaver, decimal, for stor, uden dato)", async () => {
    // som bruger: negativt tal stoppes af feltet (min=0), bogstaver kan ikke skrives i et tal-felt
    await page.locator("#m-views").fill("-5");
    const before = await page.locator("tbody tr").count();
    await page.getByRole("button", { name: "Gem måling" }).click();
    await page.waitForTimeout(500);
    eq(await page.locator("tbody tr").count(), before, "negativt tal blev gemt som række");
    must(await page.locator("#m-views").evaluate((e) => !e.validity.valid), "feltet markerer ikke -5 som ugyldigt");
    await page.locator("#m-views").fill("");
    await page.locator("#m-views").click();
    await page.keyboard.type("abc");
    eq(await page.locator("#m-views").inputValue(), "", "bogstaver kom ind i et tal-felt");
    // og serveren, hvis nogen omgår formularen
    const bad = async (m, why) => {
      await expectBad(400, /\/api\/marketing/, async () => { const r = await api({ action: "measureAdd", measure: { postedOn: today, ...m } }); eq(r.status, 400, why); must(r.json?.error, `${why}: ingen fejltekst`); });
    };
    await bad({ views: -1 }, "negativ");
    await bad({ views: "abc" }, "bogstaver");
    await bad({ views: 1.5 }, "decimal");
    await bad({ views: "" , saves: "x1" }, "tekst i saves");
    await bad({ skipPct: 150 }, "procent over 100");
    await expectBad(400, /\/api\/marketing/, async () => { const r = await api({ action: "measureAdd", measure: { views: 5 } }); eq(r.status, 400, "uden dato"); });
    await expectBad(400, /\/api\/marketing/, async () => { const r = await api({ action: "measureAdd", measure: { postedOn: "2026-13-45", views: 5 } }); eq(r.status, 400, "umulig dato"); });
    await expectBad(400, /\/api\/marketing/, async () => { const r = await api({ action: "measureAdd", measure: { postedOn: today, views: 1, postUrl: "javascript:alert(1)" } }); eq(r.status, 400, "javascript-link"); });
    // stort tal: skal afvises pænt (400), ikke give 500 fra databasen
    const r = await api({ action: "measureAdd", measure: { postedOn: today, views: 3_000_000_000 } });
    must(r.status === 400, `3 mia. visninger gav HTTP ${r.status} (${JSON.stringify(r.json)}) — skal være en pæn 400`);
  });
  await step("måling: dato i fortid/fremtid uden for rimelighed afvises", async () => {
    await expectBad(400, /\/api\/marketing/, async () => {
      const r = await api({ action: "measureAdd", measure: { postedOn: "0002-10-16", views: 5 } });
      eq(r.status, 400, "dato i år 0002 skal afvises");
    });
  });
  await step("måling: link til opslaget gemmes og kan åbnes", async () => {
    await page.reload(); await settle();
    await page.locator("#m-views").fill("10");
    await page.locator("#m-url").fill("https://www.instagram.com/reel/E2E-" + tag + "/");
    await page.getByRole("button", { name: "Gem måling" }).click();
    await page.getByText("Målingen er gemt.").waitFor();
    const a = page.locator("tbody tr").first().locator("a");
    eq(await a.getAttribute("href"), "https://www.instagram.com/reel/E2E-" + tag + "/", "link");
    eq(await a.getAttribute("target"), "_blank", "target");
  });
  await step("måling: ret en måling der blev tastet forkert", async () => {
    await page.reload(); await settle();
    const row = page.locator("tbody tr").filter({ hasText: "Målt kl. 20" }).or(page.locator("tbody tr").filter({ hasText: "2.000" })).first();
    const edit = row.getByRole("button", { name: /^Ret/ });
    must((await edit.count()) >= 1, "en måling kan ikke rettes, når den først er gemt (ingen Ret-knap)");
    await edit.first().click();
    await page.locator("#m-views").fill("2500");
    await page.getByRole("button", { name: /Gem/ }).first().click();
    await page.waitForTimeout(600);
    must(await page.locator("tbody tr").filter({ hasText: "2.500" }).count() >= 1, "rettet tal vises ikke");
    S.measured.views += 500;
  });
  await step("tragt: viser tal efter måling og klik på fanen (ingen forældet cache)", async () => {
    await goTab("Tragt", "/marketing");
    const f = await readFunnel();
    const prevViews = S.f0[0].n ?? 0;
    must(f[0].n != null && f[0].n >= prevViews + 3200, `rækkevidde ${f[0].n} burde være mindst ${prevViews + 3200}`);
    must(f[1].n != null && f[1].n >= (S.f0[1].n ?? 0) + 100, `gemt og delt ${f[1].n} burde være mindst +100`);
    must(f[2].n != null && f[2].n >= (S.f0[2].n ?? 0) + 25, "profilbesøg burde være +25");
    must(f[3].n != null && f[3].n >= (S.f0[3].n ?? 0) + 2, "henvendelser burde være +2");
    must(f[1].pct.includes("% af forrige trin"), `procent af forrige trin mangler: "${f[1].pct}"`);
    if (S.empty0) {
      eq(await page.getByText("Ingen målinger endnu.").count(), 0, "tom-besked skal være væk efter måling");
      must(await page.getByText("Samlet over", { exact: false }).isVisible(), "'Samlet over N målinger' mangler");
    }
    R.notes.push(`${vp.name}: tragt efter måling = ${f.map((s) => `${s.label} ${s.val}${s.pct ? ` (${s.pct})` : ""}`).join(" · ")}`);
  });
  await step("tragt: 'Pr. spor' viser rækken for faceless efter måling koblet til en kladde", async () => {
    must(await page.getByRole("heading", { name: /Pr\. spor/ }).isVisible(), "'Pr. spor' mangler efter måling på en kladde");
  });

  // ============ 5. A/B-tests
  await step("a/b: opret test (kun A/B udfyldt) → 'For tidligt' med 0 opslag", async () => {
    await goTab("A/B-tests", "/marketing/tests");
    S.ab1 = T("Slutkort Gem mod Send");
    await page.getByRole("button", { name: "+ Ny test" }).click();
    const f = page.locator("form").filter({ has: page.getByRole("heading", { name: "Ny test" }) });
    must(await btn(f, "Gem testen").isDisabled(), "Gem skal være slået fra uden felter");
    await field(f, "Hvad tester vi?").fill(S.ab1);
    await field(f, "Udgave A").fill('Slutkort: "Gem den her"');
    await field(f, "Udgave B").fill('Slutkort: "Send til en ven" æøå');
    await btn(f, "Gem testen").click();
    const t = page.locator("article").filter({ hasText: S.ab1 });
    await t.waitFor();
    eq((await t.locator(".mk-verdict-title").innerText()).trim(), "For tidligt", "ny test skal vise 'For tidligt'");
    must(await t.getByText("0 opslag").count() === 2, "begge sider skal vise 0 opslag");
    S.abStart = await page.getByText("kører", { exact: false }).count();
  });
  const addAbPost = async (arm, views, saves, shares = 0) => {
    await page.getByLabel("Hører den til en test?").selectOption({ label: S.ab1 });
    await page.getByLabel("Udgave", { exact: true }).selectOption(arm);
    await page.locator("#m-views").fill(String(views));
    await page.locator("#m-saves").fill(String(saves));
    if (shares) await page.locator("#m-shares").fill(String(shares));
    await page.getByRole("button", { name: "Gem måling" }).click();
    await page.getByText("Målingen er gemt.").waitFor();
    await page.waitForTimeout(150);
  };
  const verdict = async () => {
    await goTab("A/B-tests", "/marketing/tests");
    const t = page.locator("article").filter({ hasText: S.ab1 });
    return { title: (await t.locator(".mk-verdict-title").innerText()).trim(), text: (await t.locator(".mk-verdict").innerText()).replace(/\s+/g, " ").trim(), arms: (await t.locator(".mk-arm").allInnerTexts()).map((s) => s.replace(/\s+/g, " ")) };
  };
  await step("a/b: A uden arm kan ikke gemmes, og arm kræver en test", async () => {
    await goTab("Måling", "/marketing/maaling");
    await page.getByLabel("Hører den til en test?").selectOption({ label: S.ab1 });
    must(await page.getByLabel("Udgave", { exact: true }).isVisible(), "'Udgave' dukker ikke op efter valg af test");
    await page.locator("#m-views").fill("100");
    const rows = await page.locator("tbody tr").count();
    await page.getByRole("button", { name: "Gem måling" }).click();
    await page.waitForTimeout(400);
    eq(await page.locator("tbody tr").count(), rows, "måling uden A/B-valg blev gemt (arm er required)");
    await page.getByLabel("Hører den til en test?").selectOption("");
    must(!(await page.getByLabel("Udgave", { exact: true }).count()), "'Udgave' skal skjules, når 'Nej' er valgt");
  });
  await step("a/b: pilot under minimum (2 A + 3 B) → 'For tidligt' og 'mangler 1'", async () => {
    await page.reload(); await settle();
    await addAbPost("A", 1000, 100); await addAbPost("A", 1000, 90);
    await addAbPost("B", 1000, 70); await addAbPost("B", 1000, 60); await addAbPost("B", 1000, 80);
    const v = await verdict();
    eq(v.title, "For tidligt", "dom ved 2A/3B");
    must(/Mangler 1 mere/.test(v.text), `tekst: ${v.text}`);
  });
  await step("a/b: 3 + 3 opslag → 'Signal' (ikke 'Skær', selv ved stor forskel)", async () => {
    await goTab("Måling", "/marketing/maaling");
    await addAbPost("A", 1000, 80);
    const v = await verdict();
    must(/^Signal/.test(v.title), `dom ved 3A/3B: ${v.title} — ${v.text}`);
    must(/A ligger foran/.test(v.text), `tekst: ${v.text}`);
  });
  await step("a/b: 5 + 5 opslag og én side ≥ 25 % dårligere → 'Skær'", async () => {
    await goTab("Måling", "/marketing/maaling");
    await addAbPost("A", 1000, 100); await addAbPost("A", 1000, 100); await addAbPost("B", 1000, 60); await addAbPost("B", 1000, 65);
    const v = await verdict();
    must(/^Skær/.test(v.title), `dom ved 5A/5B: ${v.title} — ${v.text}`);
    must(/Drop B/.test(v.text), `tekst: ${v.text}`);
  });
  await step("a/b: 25 %-tærsklen — præcis 25 % → Skær, 24 % → Signal (rå API, UI-dom)", async () => {
    const mk = async (title, aVal, bVal) => {
      const t = await api({ action: "abCreate", test: { title, armA: "A", armB: "B" } });
      eq(t.status, 200, "opret test");
      for (let i = 0; i < 5; i++) {
        for (const [arm, saves] of [["A", aVal], ["B", bVal]]) eq((await api({ action: "measureAdd", measure: { postedOn: today, abId: t.json.test.id, arm, views: 1000, saves } })).status, 200, "måling");
      }
    };
    await mk(T("tærskel 25"), 100, 75);
    await mk(T("tærskel 24"), 100, 76);
    await mk(T("nul-nul"), 0, 0);
    await page.reload(); await settle();
    const get = async (t) => (await page.locator("article").filter({ hasText: t }).locator(".mk-verdict-title").innerText()).trim();
    must(/^Skær/.test(await get(T("tærskel 25"))), `25 % præcis: ${await get(T("tærskel 25"))}`);
    must(/^Signal/.test(await get(T("tærskel 24"))), `24 %: ${await get(T("tærskel 24"))}`);
    must(/^Ingen afgørelse/.test(await get(T("nul-nul"))), `0 mod 0: ${await get(T("nul-nul"))}`);
  });
  await step("a/b: status planlagt → kører → afsluttet, og 'A/B-tests kører' på Tragt følger med", async () => {
    await goTab("Tragt", "/marketing");
    const before = (await readTodo()).running;
    await goTab("A/B-tests", "/marketing/tests");
    const sel = page.locator("article").filter({ hasText: S.ab1 }).getByLabel("Status");
    await sel.selectOption("kører");
    await page.waitForTimeout(500);
    await goTab("Tragt", "/marketing");
    eq((await readTodo()).running, before + 1, "'kører' på Tragt efter statusskift");
    await goTab("A/B-tests", "/marketing/tests");
    await page.locator("article").filter({ hasText: S.ab1 }).getByLabel("Status").selectOption("afsluttet");
    await page.waitForTimeout(500);
    await page.reload(); await settle();
    eq(await page.locator("article").filter({ hasText: S.ab1 }).getByLabel("Status").inputValue(), "afsluttet", "status efter reload");
  });
  await step("a/b: sådan dømmer vi — forklaringen står på siden og tilsvarer reglerne", async () => {
    const txt = await page.locator("section").first().innerText();
    for (const w of ["For tidligt", "Signal", "Skær", "Ingen afgørelse", "25 %"]) must(txt.includes(w), `forklaringen mangler "${w}"`);
  });

  // ============ 6. Hooks, Inspiration, Musik
  await step("hooks: spor-tællere stemmer med listen", async () => {
    await goTab("Hooks", "/marketing/hooks");
    for (const [n, re] of [["Faceless", /^Faceless/], ["Lucas + Charlie", /^Lucas \+ Charlie/], ["Dag N", /^Dag N/]]) {
      const b = page.getByRole("button", { name: re }).first();
      await b.click();
      const count = Number((await b.innerText()).match(/(\d+)\s*$/)?.[1] ?? NaN);
      const shown = await page.locator("#mk-ready ~ .mk-list article").count();
      eq(shown, count, `antal hooks i sporet ${n}`);
    }
    await page.getByRole("button", { name: /^Faceless/ }).first().click();
  });
  await step("hooks: lav kladde af et færdigt hook → står i Kladder, og pladsholder blokerer godkend", async () => {
    const art = page.locator("#mk-ready ~ .mk-list article").first();
    const hook = (await art.locator(".mk-hook").innerText()).trim();
    S.hook1 = hook;
    await btn(art, "Lav kladde af den").click();
    await art.getByText("Kladden er lavet.").waitFor();
    await art.getByRole("link", { name: "Kladder" }).click();
    await page.waitForURL("**/marketing/kladder");
    await settle();
    const c = page.locator("article.mk-draft").filter({ hasText: hook.slice(0, 40) }).first();
    must(await c.isVisible(), "kladden fra hooket findes ikke under Kladder");
    if (/\[[^\]\n]{1,24}\]/.test(hook)) must(await btn(c, "Godkend").isDisabled(), "hook med [N] kunne godkendes");
  });
  await step("hooks: et hook med [N] markeres 'Skal have rigtigt tal i' og kladden kan ikke godkendes", async () => {
    await goTab("Hooks", "/marketing/hooks");
    const art = page.locator("#mk-ready ~ .mk-list article").filter({ hasText: "Skal have rigtigt tal i" }).first();
    if (!(await art.count())) { R.notes.push(`${vp.name}: ingen færdige faceless-hooks med [N] — pladsholder-markering ikke testet her`); return; }
    const hook = (await art.locator(".mk-hook").innerText()).trim();
    await btn(art, "Lav kladde af den").click();
    await art.getByText("Kladden er lavet.").waitFor();
    await goTab("Kladder", "/marketing/kladder");
    const c = page.locator("article.mk-draft").filter({ hasText: hook.slice(0, 30) }).first();
    must(await btn(c, "Godkend").isDisabled(), "kladde med [N]-hook kunne godkendes");
  });
  await step("hooks: mønstre (bibliotek) kan foldes ud og laves til kladde", async () => {
    await goTab("Hooks", "/marketing/hooks");
    const fam = page.locator("#mk-lib ~ details").first();
    await fam.locator("summary").click();
    const item = fam.locator("article").first();
    await btn(item, "Lav kladde af den").click();
    await item.getByText("Kladden er lavet.").waitFor();
  });
  await step("hooks: 'Lav kladde' to gange giver ikke stille dubletter uden at man ved det", async () => {
    // dokumentér: antal kladder med samme titel efter to klik (info, ikke fejl hvis brugeren ser beskeden)
    await goTab("Kladder", "/marketing/kladder");
    const n = await page.locator("article.mk-draft").filter({ hasText: S.hook1.slice(0, 30) }).count();
    R.notes.push(`${vp.name}: ${n} kladde(r) med hook "${S.hook1.slice(0, 30)}…" (hver kørsel laver en ny)`);
  });
  await step("inspiration: egne links — ugyldige afvises, gyldigt gemmes og overlever reload", async () => {
    await goTab("Inspiration", "/marketing/inspiration");
    const title = T("Fedt opslag om ørreder 🎣");
    const form = page.locator("form").first();
    await form.locator("#i-title").fill(title);
    await form.locator("#i-url").fill("ikke en adresse");
    const before = await page.locator("article.mk-item").count();
    await btn(form, "Gem link").click();
    await page.waitForTimeout(400);
    eq(await page.locator("article.mk-item").count(), before, "ugyldig adresse blev gemt");
    await form.locator("#i-url").fill("javascript:alert(1)");
    await expectBad(400, /\/api\/marketing/, async () => { await btn(form, "Gem link").click(); await form.locator(".mk-err").waitFor(); });
    must(/http/.test(await form.locator(".mk-err").innerText()), "fejlteksten forklarer ikke at adressen skal være http(s)");
    await form.locator("#i-url").fill("https://www.instagram.com/reel/test-" + tag + "/");
    await form.locator("#i-why").fill("Fordi den starter med et tal");
    await btn(form, "Gem link").click();
    await page.locator("article.mk-item").filter({ hasText: title }).waitFor();
    eq(await page.locator("#i-title").inputValue(), "", "formularen blev ikke ryddet");
    await page.reload(); await settle();
    const it = page.locator("article.mk-item").filter({ hasText: title });
    must(await it.getByRole("link", { name: "Åbn opslaget" }).getAttribute("rel") === "noreferrer noopener", "link mangler rel=noreferrer noopener");
  });
  await step("inspiration: 'Stærkest' står øverst i sin gruppe", async () => {
    const groups = page.locator("section[aria-labelledby^='mk-i-']");
    const n = await groups.count();
    must(n >= 2, "der skal være flere grupper");
    for (let i = 0; i < n; i++) {
      const flags = await groups.nth(i).locator("article.mk-item").evaluateAll((els) => els.map((e) => /Stærkest/.test(e.textContent ?? "")));
      const firstFalse = flags.indexOf(false);
      must(firstFalse === -1 || !flags.slice(firstFalse).includes(true), `gruppe ${i}: 'Stærkest' står ikke først`);
    }
  });
  await step("musik: siden forklarer reglerne og tallene stemmer", async () => {
    await goTab("Musik", "/marketing/musik");
    must(await page.getByText("Kinly er en erhvervskonto").first().isVisible(), "advarsel om erhvervskonto mangler");
    const txt = await page.locator("p.mk-small").first().innerText();
    const m = txt.match(/(\d+) af (\d+) har valgt lyd\. (\d+) har ingen musik/);
    must(m, `uventet tekst: ${txt}`);
    eq(Number(m[1]) + Number(m[3]), Number(m[2]), "valgt + ingen = i alt");
    const rows = await page.locator("tbody tr").count();
    eq(rows, Number(m[1]), "antal rækker i musik-tabellen");
  });

  // ============ 9. Server-grænser (rå kald)
  await step("server: ukendt handling, fremmede felter og ugyldige værdier giver 400 (aldrig 500)", async () => {
    const cases = [
      [{ action: "nej" }, "ukendt action"],
      [{ action: "draftCreate", draft: { title: "x", status: "godkendt" } }, "status ved oprettelse"],
      [{ action: "draftCreate", draft: { title: "x", charlieOk: true } }, "charlieOk ved oprettelse"],
      [{ action: "draftCreate", draft: { hook: "ingen titel" } }, "uden titel"],
      [{ action: "draftCreate", draft: { title: "x", track: "andet" } }, "ukendt spor"],
      [{ action: "draftCreate", draft: { title: "x", lengthS: 301 } }, "længde over 300"],
      [{ action: "draftCreate", draft: { title: "x", plannedFor: "i morgen" } }, "dato som tekst"],
      [{ action: "draftUpdate", id: "ikke-et-uuid", draft: { title: "x" } }, "ugyldigt id"],
      [{ action: "draftUpdate", id: "00000000-0000-4000-8000-000000000000", draft: { title: "x" } }, "kladde findes ikke"],
      [{ action: "draftAction", id: "00000000-0000-4000-8000-000000000000", op: "approve" }, "godkend ukendt kladde"],
      [{ action: "draftAction", id: "00000000-0000-4000-8000-000000000000", op: "slet" }, "ukendt op"],
      [{ action: "abStatus", id: "00000000-0000-4000-8000-000000000000", status: "kører" }, "test findes ikke"],
      [{ action: "abCreate", test: { title: "x" } }, "test uden udgaver"],
      [{ action: "inspirationAdd", item: { title: "" } }, "inspiration uden titel"],
      [{ action: "draftChecks", id: "00000000-0000-4000-8000-000000000000", checks: { charlieOk: true } }, "tjek på ukendt kladde"],
    ];
    const bad = [];
    for (const [body, why] of cases) {
      const r = await page.evaluate(async (b) => { const x = await fetch("/api/marketing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); return x.status; }, body);
      if (r !== 400) bad.push(`${why}: HTTP ${r}`);
    }
    must(bad.length === 0, bad.join("; "));
  });
  await step("server: priority, godkend-tilstande og ugyldig dato afvises", async () => {
    const mkd = await api({ action: "draftCreate", draft: { title: T("grænser"), hook: "Hook" } });
    const id = mkd.json.draft.id;
    const bad = [];
    for (const [body, why] of [
      [{ action: "draftUpdate", id, draft: { priority: 0 } }, "priority 0"],
      [{ action: "draftUpdate", id, draft: { priority: 4 } }, "priority 4"],
      [{ action: "draftUpdate", id, draft: { priority: "høj" } }, "priority tekst"],
      [{ action: "draftUpdate", id, draft: { plannedFor: "2026-02-30" } }, "30. februar"],
      [{ action: "draftAction", id, op: "posted" }, "postet uden at være godkendt"],
      [{ action: "draftAction", id, op: "restore" }, "gendan en kladde der ikke er droppet"],
      [{ action: "draftAction", id, op: "approve" }, "godkend uden sandt-dato"],
      [{ action: "draftChecks", id, checks: { trueCheckedOn: "i dag" } }, "sandt-dato som tekst"],
    ]) {
      const r = await page.evaluate(async (b) => (await fetch("/api/marketing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })).status, body);
      if (r !== 400) bad.push(`${why}: HTTP ${r}`);
    }
    // urimelige datoer (år 0002 / 20260) skal heller ikke ind
    for (const d of ["0002-10-16", "1900-01-01", "9999-12-31"]) {
      const r = await page.evaluate(async ([i, dd]) => (await fetch("/api/marketing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "draftUpdate", id: i, draft: { plannedFor: dd } }) })).status, [id, d]);
      if (r !== 400) bad.push(`dato ${d}: HTTP ${r}`);
    }
    must(bad.length === 0, bad.join("; "));
  });
  await step("server: kald uden Origin og fra fremmed Origin afvises (403)", async () => {
    for (const headers of [{}, { Origin: "https://evil.example" }]) {
      const r = await fetch(BASE + "/api/marketing", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ action: "draftCreate", draft: { title: "uden origin" } }) });
      eq(r.status, 403, `status uden/forkert Origin (${JSON.stringify(headers)})`);
    }
  });
  await step("server: ingen drafts kan skrives gennem GET, og /api/marketing svarer ikke på GET", async () => {
    const r = await fetch(BASE + "/api/marketing");
    must(r.status === 405 || r.status === 404, `GET gav ${r.status}`);
  });

  // ============ 8. Gentagelser: sundhed igen efter alle ændringer + tilbage/frem
  for (const [name, p] of PAGES) {
    await step(`side ${name} (efter flows): sundhed`, async () => { await open(p); await pageHealth(`efter-${name}`); });
  }
  await step("tilbage/frem gennem alle faner giver ikke fejl", async () => {
    await open("/marketing");
    for (const [name, p] of PAGES.slice(1)) await goTab(name, p);
    for (let i = 0; i < 4; i++) { await page.goBack(); await settle(); }
    for (let i = 0; i < 2; i++) { await page.goForward(); await settle(); }
    must(await page.locator("h1").first().isVisible(), "siden er tom efter tilbage/frem");
  });
  await step("tragt (til sidst): tæller på 'Til dig nu' følger med kladderne", async () => {
    await open("/marketing");
    const t = await readTodo();
    must(t.waiting > (S.todo0?.waiting ?? 0), `'kladder venter' ${t.waiting} burde være større end ved start (${S.todo0?.waiting})`);
    await page.getByRole("link", { name: /kladder venter på godkendelse|kladde venter på godkendelse/ }).click();
    await page.waitForURL("**/marketing/kladder"); await settle();
  });

  await ctx.close();
}

// ---------------------------------------------------------------- kør

const browser = await chromium.launch();
try {
  for (const def of VIEWPORTS) if (!process.env.E2E_VP || process.env.E2E_VP === def.name) await runViewport(def, browser);
} finally {
  await browser.close();
}

// ---------------------------------------------------------------- rapport
const dedup = new Map();
for (const i of R.issues) dedup.set(`${i.where}|${i.kind}|${i.text}`, i);
const issues = [...dedup.values()];
const report = { steps: R.steps, failedSteps: R.failures.length, consoleHttpIssues: issues.length, failures: R.failures, issues, notes: R.notes };
writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
console.log("\n==== RAPPORT ====");
console.log(`trin: ${R.steps} · fejlede trin: ${R.failures.length} · konsol/http-fund: ${issues.length}`);
for (const f of R.failures) console.log(`FEJL  ${f.step}\n      ${f.error}`);
for (const i of issues) console.log(`FUND  [${i.kind}] ${i.where} :: ${i.text}`);
for (const n of R.notes) console.log(`note  ${n}`);
console.log(`screenshots + report.json: ${OUT}`);
process.exit(R.failures.length || issues.length ? 1 : 0);
