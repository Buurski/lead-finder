// scripts/leadgen/run.mjs — daglig lead-gen (porteret fra _leadgen_v2_selective.mjs 2026-09-02).
// Reuses the app's real modules (compose/chains/branch-policy/contactable/
// suppress/sheets) so the never-twice gate + voice rules stay CODE.
// Alle stier er env-styrede så scriptet kan køre på VPS'en (se vps-run.sh).
//   phases: plan -> source -> rate (chunked, resumable) -> finalize -> apply
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const imp = (p) => import(pathToFileURL(path.join(ROOT, "src", "lib", p)).href);
const PHASE = process.argv[2] || "source";
const WORKDIR = process.env.LEADGEN_WORKDIR || path.join(ROOT, ".leadgen-work");
const F = (n) => path.join(WORKDIR, `lg_v2_${n}.json`);
const rd = (n) => JSON.parse(fs.readFileSync(F(n), "utf-8"));
const wr = (n, o) => { fs.mkdirSync(WORKDIR, { recursive: true }); fs.writeFileSync(F(n), JSON.stringify(o)); };
const log = (...a) => console.error("[leadgen]", ...a);
const nowIso = new Date().toISOString();
const KOS_ROOT = process.env.KOS_ROOT || path.join(ROOT, "..", "KnowledgeOS");
const KOS_LEADGEN = path.join(KOS_ROOT, "data", "leadgen.json");
const QUEUE_PATH = process.env.LEAD_QUEUE_PATH || path.join(ROOT, ".send_queue", "approval_queue.json");

// ---- env + service-account credentials (env først, .env-fil som fallback) ----
function loadEnv(root) {
  for (const f of [".env.local", ".env.production"]) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf-8").split(/\r?\n/)) {
      const mm = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!mm || process.env[mm[1]]) continue;
      process.env[mm[1]] = mm[2];
    }
  }
}
function parseCreds(raw) {
  raw = raw.trim();
  if (raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1);
  const s = raw.replace(/\\n/g, "\n");
  const email = (s.match(/"client_email"\s*:\s*"([^"]+)"/) || [])[1];
  const proj = (s.match(/"project_id"\s*:\s*"([^"]+)"/) || [])[1];
  const pkm = s.match(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/);
  const pk = (pkm ? pkm[0] : "").replace(/\n+/g, "\n").trim() + "\n";
  if (!email || !pkm) return null;
  return { client_email: email, private_key: pk, project_id: proj };
}
// Kaldes kun af faser der rører Sheets (source/apply) — plan/rate/finalize skal kunne køre uden.
function requireCreds() {
  let raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "";
  const keyFile = process.env.GOOGLE_KEY_FILE;
  if (!raw.trim() && keyFile && fs.existsSync(keyFile)) raw = fs.readFileSync(keyFile, "utf-8");
  const creds = raw.trim() ? parseCreds(raw) : null;
  if (!creds) {
    throw new Error("Mangler Google service-account credentials. Sæt GOOGLE_SERVICE_ACCOUNT_JSON " +
      "(hele JSON'en som streng) eller GOOGLE_KEY_FILE (sti til service-account-JSON). " +
      "På VPS'en kommer de fra /root/.hermes/credentials.env.");
  }
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify(creds);
}
function requirePlacesKey() {
  const k = process.env.GOOGLE_PLACES_API_KEY;
  if (!k) throw new Error("Mangler GOOGLE_PLACES_API_KEY i env — kan ikke source fra Google Places.");
  return k;
}
loadEnv(ROOT);

function withTimeout(factory, ms) {
  return Promise.race([
    Promise.resolve().then(factory).catch(() => null),
    new Promise((res) => setTimeout(() => res(null), ms)),
  ]);
}
async function fetchHtml(url, ms = 7000) {
  return withTimeout(async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms - 500);
    try {
      const r = await fetch(url, { redirect: "follow", signal: ctrl.signal,
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) leadgen/1.0" } });
      const reader = r.body && r.body.getReader ? r.body.getReader() : null;
      if (!reader) { const txt = await r.text(); return txt.slice(0, 150000); }
      const dec = new TextDecoder(); let out = "", got = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        out += dec.decode(value, { stream: true }); got += value.length;
        if (got > 150000) { try { await reader.cancel(); } catch {} break; }
      }
      return out;
    } finally { clearTimeout(t); }
  }, ms);
}

// ---- query plan: skin + restaurant weighted heaviest, 1 barber/city ----
const SKIN_Q = ["skønhedsklinik", "kosmetolog", "hudpleje", "permanent makeup"];
// Exclude hotels, public pools, sports/leisure centres, resorts and obvious
// non-clinic chains that the generic "spa wellness" query used to drag in.
const EXCLUDE_NAME = /hudlæge|hudlaege|dermatolog|hudlæger|tandlæge|tandlaege|hotel|strandhotel|kurhotel|svømmehal|svømmehall|svømmebad|badeland|vandland|aquadventure|idrætscenter|idraetscenter|fritidscenter|sportscenter|sportcenter|kulturhus|gigantium|kurbad|\bresort\b|comwell|scandic|best western|radisson|seaside|slot copenhagen|feriecenter|camping/i;
const FULL_PLAN = [
  ...SKIN_Q.map((q) => ({ q, cat: "skin" })),   // 4 skin queries — highest priority
  { q: "frisørsalon", cat: "salon" },
  { q: "populær restaurant", cat: "mad" },
  { q: "café", cat: "mad" },
  // håndværk/foto/service taget ud af dagsplanen 2026-09-02 (council + attribution):
  // 0 udvalgte af 40 kald i første VPS-kørsel, elektriker 2,8 % svar (n=36) mod
  // café 19 % / salon 17 %. Sparer ~40 Places-kald/dag. Sæt dem ind igen her
  // hvis håndværk skal tilbage — DIV_MIN nedenfor skal så også op.
]; // ~7 queries/city (var 11). barber/neglesalon/bistro dropped from daily plan (backlog full; negle still caught by name-categorisation).
// Copenhagen kept deliberately light (geo rule: <=20% of batch).
const CPH_PLAN = [
  { q: "skønhedsklinik", cat: "skin" }, { q: "populær restaurant", cat: "mad" },
];
const PROVINCE = ["Aarhus", "Odense", "Aalborg", "Esbjerg", "Randers", "Kolding", "Horsens", "Vejle",
  "Silkeborg", "Herning", "Viborg", "Næstved", "Sønderborg", "Hjørring", "Holstebro", "Fredericia",
  "Roskilde", "Helsingør", "Aabenraa", "Svendborg", "Skagen", "Sæby", "Aars", "Støvring", "Bjerringbro",
  "Ry", "Galten", "Hørning", "Tarm", "Videbæk", "Vojens", "Gråsten", "Nordborg", "Otterup", "Ringe",
  "Glamsbjerg", "Bogense", "Maribo", "Sakskøbing", "Stege", "Haslev", "Faxe", "Augustenborg", "Christiansfeld"];
const CPH = ["København", "Frederiksberg"];
const FIELD_MASK = "places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.websiteUri,places.nationalPhoneNumber,places.id,places.types,places.businessStatus";

// diversity minimums (selection) per 2026-06-21 SKILL
const DIV_MIN = { skin: 5, salon: 2, mad: 5, "håndværk": 0, foto: 0, service: 0 };
const CAP = { barber: 2, negle: 2 };          // hard caps (tightened — backlog full)
const TARGET_DRAFTS = 20;                        // medium-selective daily target
const SELECT_MAX = 70;                           // over-select to absorb no-email/suppress attrition
const CPH_CAP = Math.ceil(TARGET_DRAFTS * 0.2); // 4
// ---- daily call budget + deterministic city rotation (free-tier safe: <=150/day) ----
const MAX_CALLS = 130;            // hard in-code cap; Google quota is the backstop
const CITIES_PER_DAY = 10;        // rotate through the province pool each day
function dayOfYear(d = new Date()) {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start) / 86400000);
}
function todaysProvince() {
  // stride-sample so every day mixes big + small cities (avoids all-small-town days)
  const n = PROVINCE.length, doy = dayOfYear(), stride = Math.max(1, Math.floor(n / CITIES_PER_DAY)), out = [];
  for (let i = 0; i < CITIES_PER_DAY; i++) out.push(PROVINCE[(doy + i * stride) % n]);
  return out;
}
function buildJobs() {
  const jobs = [];
  for (const city of todaysProvince()) for (const p of FULL_PLAN) jobs.push({ city, q: p.q, cat: p.cat, cph: false });
  if (dayOfYear() % 2 === 0) for (const city of CPH) for (const p of CPH_PLAN) jobs.push({ city, q: p.q, cat: p.cat, cph: true });
  return jobs;
}
async function phasePlan() {
  const jobs = buildJobs(); const cities = [...new Set(jobs.map((j) => j.city))];
  const byCat = {}; for (const j of jobs) byCat[j.cat] = (byCat[j.cat] || 0) + 1;
  console.log(JSON.stringify({ day: new Date().toISOString().slice(0, 10), cities_today: cities,
    total_calls_planned: jobs.length, max_calls_cap: MAX_CALLS, within_free_tier_150: jobs.length <= 150,
    queries_by_cat: byCat, workdir: WORKDIR, leadgen_json: KOS_LEADGEN, queue_path: QUEUE_PATH }, null, 2));
}

const BARBER_RE = /barber|fades|\bcuts?\b|herreklip|herre ?frisør|herre ?klip/i;
const BROAD_SALON_RE = /unisex|dame|farve|styling|hårsalon|frisørsalon|hair ?studio|saloon/i;
const NEGLE_RE = /negle|nails|nail/i;

function categorize(name, queryCat) {
  const n = (name || "").toLowerCase();
  if (NEGLE_RE.test(n)) return "negle";
  if (queryCat === "skin") return "skin";
  if (queryCat === "salon") return BARBER_RE.test(n) && !BROAD_SALON_RE.test(n) ? "barber" : "salon";
  if (queryCat === "barber") return BROAD_SALON_RE.test(n) && !BARBER_RE.test(n) ? "salon" : "barber";
  return queryCat;
}

// Lucas' beslutning 2026-08-19: kun leads med verificeret mail ELLER telefon må drafts.
// Hårdt filter — ikke bare +5/+5 i fitScore.
export function hasContact(c) {
  return Boolean((c && c.phone) || (c && c.email) || (c && c.emailOnSite));
}

// Candidate -> leadgen.json item. place_id: ingest-ruten (route.ts) bruger it.place_id
// til leadId/dedup — uden det falder den tilbage til navn, som er en svagere nøgle.
// gap/site_issues findes ikke i denne pipeline (kun hasViewport/bureau/copyrightYear)
// — udeladt, ikke opfundet.
export function toLeadgenItem(c) {
  return { name: c.name, branch: c.queryBranch, category: c.cat, city: c.city, address: c.address,
    phone: c.phone, email: c.email || "", website: c.website, rating: c.rating, reviews: c.reviews, fitScore: c.fitScore,
    place_id: c.place_id,
    hasViewport: c.hasViewport ?? null, bureau: !!c.bureau, copyrightYear: c.copyrightYear ?? null,
    source: "places-direct", cvr_flag: c.cvr_flag || "cvr_unchecked", cph: !!c.cph, drafted: !!c.drafted, skip: c.skip || "" };
}

// =================== PHASE: source ===================
async function phaseSource() {
  requireCreds();
  const PLACES_KEY = requirePlacesKey();
  const { isChain } = await imp("chains.ts");
  const { isExcludedBranch } = await imp("leads/branch-policy.ts");
  const { isContactable } = await imp("leads/contactable.ts");
  const { bizKey } = await imp("leads/suppress.ts");
  const { getLeads } = await imp("sheets.ts");

  let sheetsLeads;
  try { sheetsLeads = await getLeads(); }
  catch (err) { console.log(JSON.stringify({ fatal: "sheets_read_failed", error: String(err) })); process.exit(2); }
  const contactedKeys = new Set();
  for (const l of sheetsLeads) if (!isContactable(l)) { const k = bizKey(l.name, l.city); if (k) contactedKeys.add(k); }
  log("Sheets leads:", sheetsLeads.length, "contacted keys:", contactedKeys.size);

  const jobs = buildJobs();

  const byId = new Map();
  let calls = 0, rateLimited = false, idx = 0;
  async function search(job) {
    const res = await withTimeout(() => fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": PLACES_KEY, "X-Goog-FieldMask": FIELD_MASK },
      body: JSON.stringify({ textQuery: `${job.q} ${job.city}`, languageCode: "da", maxResultCount: 20 }),
    }), 12000);
    calls++;
    if (!res) return;
    if (res.status === 429) { rateLimited = true; return; }
    if (!res.ok) return;
    const j = await res.json();
    for (const pl of (j.places || [])) {
      const id = pl.id; if (!id || byId.has(id)) continue;
      byId.set(id, { place_id: id, name: pl.displayName?.text || "", address: pl.formattedAddress || "",
        rating: pl.rating ?? 0, reviews: pl.userRatingCount ?? 0, website: pl.websiteUri || "",
        phone: pl.nationalPhoneNumber || "", status: pl.businessStatus || "",
        cat: categorize(pl.displayName?.text || "", job.cat), queryBranch: job.q, city: job.city, cph: job.cph });
    }
  }
  async function worker() { while (idx < jobs.length && !rateLimited && calls < MAX_CALLS) { const job = jobs[idx++]; await search(job); } }
  await Promise.all(Array.from({ length: 10 }, worker));

  const raw = [...byId.values()];
  const stats = { raw: raw.length, jobs: jobs.length };
  let pool = raw.filter((c) => c.status === "OPERATIONAL"); stats.after_status = pool.length;
  pool = pool.filter((c) => {
    if (!(c.rating >= 4.0 && c.rating <= 4.9)) return false;
    let floor = 200;
    if (c.cat === "skin") floor = (c.rating >= 4.6) ? 25 : 200;
    else if (c.cat === "salon") floor = 80;
    return c.reviews >= floor;
  }); stats.after_rating_reviews = pool.length;
  pool = pool.filter((c) => c.website); stats.after_website = pool.length;
  pool = pool.filter((c) => !isChain(c.name)); stats.after_chain = pool.length;
  pool = pool.filter((c) => !isExcludedBranch(c.queryBranch, c.name)); stats.after_medical = pool.length;
  pool = pool.filter((c) => !EXCLUDE_NAME.test(c.name)); stats.after_namefilter = pool.length;
  pool = pool.filter((c) => { const k = bizKey(c.name, c.city); return !(k && contactedKeys.has(k)); }); stats.after_contacted = pool.length;
  pool.sort((a, b) => (b.rating * Math.log10(Math.max(10, b.reviews))) - (a.rating * Math.log10(Math.max(10, a.reviews))));

  const PER_CAT = { skin: 70, mad: 55, salon: 28, barber: 6, negle: 10, "håndværk": 18, foto: 12, service: 12 };
  const poolCatCount = {};
  for (const c of pool) poolCatCount[c.cat] = (poolCatCount[c.cat] || 0) + 1;
  const balanced = [];
  for (const cat of Object.keys(PER_CAT)) balanced.push(...pool.filter((c) => c.cat === cat).slice(0, PER_CAT[cat]));
  stats.pool_by_cat = poolCatCount;
  wr("pool", { stats, calls, rateLimited, pool: balanced });
  log("SOURCE done.", JSON.stringify(stats), "calls", calls, "balancedPool", balanced.length);
  console.log(JSON.stringify({ raw: raw.length, eligible: pool.length, balanced: balanced.length, poolByCat: poolCatCount, calls, rateLimited }));
}

// =================== PHASE: rate (chunked, resumable) ===================
function scoreLead(c, html) {
  const ratingScore = Math.max(0, Math.min(1, (c.rating - 4.0) / 0.9)) * 12;
  const reviewScore = c.reviews >= 200 && c.reviews <= 1200 ? 18 : c.reviews > 1200 ? 12 : 14;
  const rr = Math.min(30, ratingScore + reviewScore);
  let webNeed, hasViewport = null, copyrightYear = null, bureau = false, emailOnSite = null;
  if (html == null) { webNeed = 15; }
  else {
    hasViewport = /<meta[^>]+name=["']?viewport/i.test(html);
    const years = [...html.matchAll(/(?:©|&copy;|copyright)[^0-9]{0,12}(20\d{2})/gi)].map((m) => +m[1]);
    copyrightYear = years.length ? Math.max(...years) : null;
    bureau = /(wedo|web1|made by|udviklet af|designet af|powered by|webbureau)\b/i.test(html);
    const em = [...new Set((html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []))]
      .filter((e) => !/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(e) && !/sentry|wixpress|example|@2x/.test(e));
    emailOnSite = em[0] || null;
    webNeed = 12;
    if (!hasViewport) webNeed += 8;
    if (copyrightYear && copyrightYear <= (new Date().getFullYear() - 3)) webNeed += 5;
    if (html.length < 6000) webNeed += 3;
    webNeed = Math.min(25, webNeed);
  }
  const fitByCat = { skin: 20, salon: 20, mad: 20, "håndværk": 20, foto: 20, negle: 16, barber: 14, service: 14 };
  const branchFit = fitByCat[c.cat] ?? 12;
  const local = 15 - (bureau ? 8 : 0);
  const contact = (c.phone ? 5 : 0) + (emailOnSite ? 5 : 0);
  const fitScore = Math.min(100, Math.round(rr + webNeed + local + branchFit + contact));
  return { fitScore, hasViewport, copyrightYear, bureau, emailOnSite,
    websiteStatus: copyrightYear && copyrightYear <= (new Date().getFullYear() - 4) ? "old" : "ok" };
}
async function phaseRate() {
  const { pool } = rd("pool");
  let rated = fs.existsSync(F("rated")) ? rd("rated").rated : [];
  const doneIds = new Set(rated.map((r) => r.place_id));
  const todo = pool.filter((c) => !doneIds.has(c.place_id)).slice(0, 26);
  let i = 0;
  async function worker() { while (i < todo.length) { const c = todo[i++]; const html = await fetchHtml(c.website); Object.assign(c, scoreLead(c, html)); rated.push(c); } }
  await Promise.all(Array.from({ length: 6 }, worker));
  wr("rated", { rated });
  const remaining = pool.length - rated.length;
  log("RATE chunk done. rated", rated.length, "of", pool.length, "remaining", remaining);
  console.log(JSON.stringify({ rated: rated.length, total: pool.length, remaining }));
}

// =================== PHASE: finalize (select + enrich CVR/email) ===================
async function cvrLookup(name) {
  const out = await withTimeout(async () => {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 4500);
    try {
      const r = await fetch(`https://cvrapi.dk/api?search=${encodeURIComponent(name)}&country=dk`, { signal: ctrl.signal, headers: { "User-Agent": "lucas-leadgen/1.0" } });
      if (!r.ok) return { ok: false };
      const j = await r.json(); if (j && j.error) return { ok: false };
      return { ok: true, data: j };
    } finally { clearTimeout(t); }
  }, 5500);
  return out || { ok: false };
}
function selectLeads(eligible) {
  const catCount = {}, selected = [], chosen = new Set();
  let cph = 0;
  const capOk = (c) => {
    if (CAP[c.cat] && (catCount[c.cat] || 0) >= CAP[c.cat]) return false;
    if (c.cph && cph >= CPH_CAP) return false;
    return true;
  };
  const add = (c) => { selected.push(c); chosen.add(c.place_id); catCount[c.cat] = (catCount[c.cat] || 0) + 1; if (c.cph) cph++; };
  for (const [cat, min] of Object.entries(DIV_MIN)) {
    let have = catCount[cat] || 0;
    for (const c of eligible) {
      if (have >= min || selected.length >= SELECT_MAX) break;
      if (c.cat !== cat || chosen.has(c.place_id)) continue;
      if (!capOk(c)) continue;
      add(c); have++;
    }
  }
  for (const c of eligible) {
    if (selected.length >= SELECT_MAX) break;
    if (chosen.has(c.place_id) || !capOk(c)) continue;
    add(c);
  }
  return { selected, catCount, cph };
}
async function phaseFinalize() {
  const { rated } = rd("rated");
  const scored = rated.filter((c) => c.fitScore >= 65);
  // hårdt kontaktfilter (2026-08-19) — leads uden telefon OG uden mail udvælges slet ikke
  const eligible = scored.filter(hasContact).sort((a, b) => b.fitScore - a.fitScore);
  const droppedNoContact = scored.length - eligible.length;
  const { selected, catCount, cph } = selectLeads(eligible);

  let cvrChecked = 0, cvrUnchecked = false, ei = 0;
  async function enrich() {
    while (ei < selected.length) {
      const c = selected[ei++];
      let email = c.emailOnSite || null;
      if (!email) { const h = await fetchHtml(c.website.replace(/\/?$/, "/kontakt"), 6000); if (h) { const m = h.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g); if (m) email = m.find((e) => !/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(e) && !/sentry|wixpress|example|@2x/.test(e)) || null; } }
      const cvr = await cvrLookup(c.name);
      if (!cvr.ok) { cvrUnchecked = true; c.cvr_flag = "cvr_unchecked"; }
      else { cvrChecked++; const d = cvr.data || {}; c.cvr_flag = "cvr_ok";
        if (!email && d.email && /@/.test(d.email)) email = d.email;
        if (/(OPHØRT|OPLØST|KONKURS|TVANGSOPL)/.test(String(d.status || "").toUpperCase())) c.cvr_flag = "cvr_inactive"; }
      c.email = email || "";
    }
  }
  await Promise.all(Array.from({ length: 6 }, enrich));
  const before = selected.length;
  const finalSel = selected.filter((c) => c.cvr_flag !== "cvr_inactive");
  const gaps = Object.entries(DIV_MIN).filter(([k, v]) => (catCount[k] || 0) < v).map(([k, v]) => `${k}: ${catCount[k] || 0}/${v}`);
  wr("final", { finalSel, catCount, cph, gaps, eligible_fit60: eligible.length, dropped_no_contact: droppedNoContact,
    dropped_cvr_inactive: before - finalSel.length, cvrChecked, cvrUnchecked });
  log("FINALIZE done. selected", finalSel.length, "catCount", JSON.stringify(catCount), "cph", cph, "gaps", JSON.stringify(gaps), "dropped_no_contact", droppedNoContact);
  console.log(JSON.stringify({ selected: finalSel.length, catCount, cph, gaps, dropped_no_contact: droppedNoContact, with_email: finalSel.filter((c) => c.email).length }));
}

// =================== PHASE: apply (queue + Sheets + leadgen.json) ===================
async function phaseApply() {
  requireCreds();
  const { composeColdEmail } = await imp("compose.ts");
  const { suppressionReason, bizKey, buildBlockSets } = await imp("leads/suppress.ts");
  const { getLeads, appendLeads } = await imp("sheets.ts");
  // Inline queue I/O (avoids queue.ts -> store.ts -> "server-only" shim that
  // doesn't resolve under plain Node). Same file + format the app reads.
  const newDraftId = () => "lg-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const readQueue = async () => { try { return JSON.parse(fs.readFileSync(QUEUE_PATH, "utf8")); } catch { return []; } };
  const REJECT_BLOCK_MS = 14 * 24 * 60 * 60 * 1000;
  const appendDrafts = async (newDrafts) => {
    const existing = await readQueue();
    const now = Date.now(), cutoff = now - REJECT_BLOCK_MS;
    const blocked = new Set();
    for (const d of existing) {
      if (!d.leadId) continue;
      if (d.status === "pending") blocked.add(d.leadId);
      else if (d.status === "rejected") { const t = new Date(d.updatedAt || d.createdAt).getTime(); if (t > cutoff) blocked.add(d.leadId); }
    }
    const seen = new Set();
    const deduped = newDrafts.filter((d) => { if (!d.leadId) return true; if (blocked.has(d.leadId) || seen.has(d.leadId)) return false; seen.add(d.leadId); return true; });
    fs.mkdirSync(path.dirname(QUEUE_PATH), { recursive: true });
    fs.writeFileSync(QUEUE_PATH, JSON.stringify(existing.concat(deduped), null, 2));
    return deduped;
  };

  const poolFile = rd("pool"); const { stats, calls, rateLimited } = poolFile;
  const finalFile = rd("final");
  const finalSel = finalFile.finalSel;

  const sheetsLeads = await getLeads();
  const queue = await readQueue();
  const blockSets = buildBlockSets(queue, sheetsLeads, Date.now());

  const draftsToAdd = []; const composeFailures = []; let noEmail = 0, noContact = 0;
  for (const c of finalSel) {
    // hårdt kontaktfilter (2026-08-19) — hverken telefon eller mail => aldrig draft
    if (!hasContact(c)) { noContact++; c.drafted = false; c.skip = "no-contact"; continue; }
    if (!c.email) { noEmail++; c.drafted = false; c.skip = "no-email"; continue; }
    const supp = suppressionReason({ leadId: c.place_id, name: c.name, city: c.city, branch: c.queryBranch }, blockSets);
    if (supp) { c.drafted = false; c.skip = supp; continue; }
    if (draftsToAdd.length >= TARGET_DRAFTS) { c.drafted = false; c.skip = "daily-cap"; continue; } // honour ~20/day target
    let composed;
    try { composed = composeColdEmail({ name: c.name, branch: c.queryBranch, city: c.city, reviewsCount: c.reviews, websiteStatus: c.websiteStatus }); }
    catch (e) { composeFailures.push({ name: c.name, err: String(e.message || e) }); c.drafted = false; c.skip = "compose-fail"; continue; }
    draftsToAdd.push({ id: newDraftId(), leadId: c.place_id, name: c.name, branch: c.queryBranch, city: c.city,
      hooks: [`${c.reviews} anmeldelser på Google`, `rating ${c.rating}`], demoPair: composed.demoPair,
      professionalism: `${c.reviews} anmeldelser, rating ${c.rating}, fitScore ${c.fitScore}${c.hasViewport === false ? ", ingen mobil-viewport" : ""}${c.bureau ? ", bureau-footer" : ""}`,
      subject: composed.subject, body: composed.text, recipientEmail: c.email, status: "pending",
      source: "places-direct", comboId: composed.comboId, openerKind: composed.openerKind, createdAt: nowIso, updatedAt: nowIso });
    c.drafted = true; blockSets.ids.add(c.place_id); const k = bizKey(c.name, c.city); if (k) blockSets.keys.add(k);
  }

  let appendedQueue = 0, appendedSheets = 0;
  if (draftsToAdd.length) { const added = await appendDrafts(draftsToAdd); appendedQueue = added.length; }
  const draftedSel = finalSel.filter((c) => c.drafted);
  if (draftedSel.length) {
    const rows = draftedSel.map((c) => ({ name: c.name, branch: c.queryBranch, phone: c.phone, city: c.city,
      score: c.fitScore, source: "places-direct", website: c.website, websiteStatus: c.websiteStatus || "ok",
      status: "new", notes: [c.cat, c.cvr_flag, c.bureau ? "bureau" : "", c.hasViewport === false ? "no-viewport" : ""].filter(Boolean).join("; "),
      lastUpdated: nowIso, websiteQualityTier: c.websiteStatus === "old" ? "old" : "", enrichedInfo: "",
      email: c.email || "", reviewsCount: c.reviews }));
    await appendLeads(rows); appendedSheets = rows.length;
  }

  const cphDrafted = draftedSel.filter((c) => c.cph).length;
  const draftedCat = {}; for (const c of draftedSel) draftedCat[c.cat] = (draftedCat[c.cat] || 0) + 1;

  // hasViewport/bureau/copyrightYear/fitScore går videre til ingest-ruten (spor B3)
  const items = finalSel.map(toLeadgenItem).sort((a, b) => b.fitScore - a.fitScore);

  const result = { at: nowIso, source: "google-places-direct", budget_used: calls, budget_remaining_today: 1500 - calls,
    candidates_raw: stats.raw, candidates_after_status: stats.after_status, candidates_after_rating_reviews: stats.after_rating_reviews,
    candidates_after_chain: stats.after_chain, candidates_after_medical: stats.after_medical, candidates_after_contacted: stats.after_contacted,
    deep_rated: rd("rated").rated.length, eligible_fit60: finalFile.eligible_fit60,
    selected: finalSel.length, drafts_created: appendedQueue, compose_failures: composeFailures.length, compose_failure_detail: composeFailures,
    sheets_appended: appendedSheets, no_email: noEmail, no_contact: noContact,
    dropped_no_contact_before_select: finalFile.dropped_no_contact ?? 0,
    dropped_cvr_inactive: finalFile.dropped_cvr_inactive, cvr_checked: finalFile.cvrChecked,
    cvr_status: finalFile.cvrUnchecked ? "cvr_unchecked (datacenter IP / quota)" : "cvr_ok", rate_limited: rateLimited,
    category_counts: finalFile.catCount, drafted_category_counts: draftedCat, diversity_min: DIV_MIN, diversity_gaps: finalFile.gaps,
    barber_cap: CAP.barber, negle_cap: CAP.negle,
    storkbh_drafted: cphDrafted, storkbh_pct: appendedQueue ? Math.round((cphDrafted / appendedQueue) * 100) : 0, storkbh_cap_pct: 20,
    cities_sourced: [...PROVINCE, ...CPH], items };
  wr("result", result);
  fs.mkdirSync(path.dirname(KOS_LEADGEN), { recursive: true });
  fs.writeFileSync(KOS_LEADGEN, JSON.stringify(result, null, 2));
  log("APPLY done. drafts", appendedQueue, "sheets", appendedSheets, "no_email", noEmail, "no_contact", noContact, "cph%", result.storkbh_pct);
  console.log(JSON.stringify({ drafts_created: appendedQueue, sheets_appended: appendedSheets, selected: finalSel.length, no_email: noEmail, no_contact: noContact, storkbh_pct: result.storkbh_pct, drafted_category_counts: draftedCat }));
}

const phases = { plan: phasePlan, source: phaseSource, rate: phaseRate, finalize: phaseFinalize, apply: phaseApply };
// kun når scriptet køres direkte — så run.test.mjs kan importere hasContact
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!phases[PHASE]) { console.error("unknown phase", PHASE); process.exit(1); }
  await phases[PHASE]();
}
