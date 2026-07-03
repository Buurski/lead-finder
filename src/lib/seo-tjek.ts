// seo-tjek.ts — the free public SEO-check funnel (/seo-tjek). A visitor gives
// URL + email + consent, we run the same checks Lucas uses for clients
// (seo.ts) plus a desktop PageSpeed run, a Places-based local-rank check and a
// booking-audit, and hand back a plain-Danish report with a "book 15 min" CTA.
//
// Split by side effects: everything a browser or the day-0/day-7 mails need
// rendered is PURE (validate/detect/rank/fixes/render/mail) and covered by
// scripts/test_seo_tjek.mjs offline. Network work (PageSpeed desktop, Places,
// runFreeCheck) lives at the bottom and degrades to null-with-note like seo.ts.
//
// Strip-safe: no Next imports; store only via lazy dynamic import.

import { runSeoChecks, type SeoResult, type LighthouseScores } from "./seo.ts";

// ---- types ----------------------------------------------------------------

export interface SeoTjekSubmission {
  id: string;
  url: string;
  email: string;
  branch?: string;
  city?: string;
  consent: true;
  consentAt: string;
  createdAt: string;
  ip?: string;
  day0SentAt?: string;
  day7SentAt?: string;
  unsubscribedAt?: string;
  reportReady?: boolean;
}

export interface LocalRankResult {
  available: boolean;
  query: string;
  position: number | null; // 1-based placement in Google Maps top-20
  total: number;
  topNames: string[];
  note: string;
  // Google-anmeldelser (social proof) — udfyldes kun når virksomheden selv
  // blev fundet i søgningen. Alle valgfrie: ældre gemte rapporter har dem ikke.
  rating?: number | null; // egen stjerne-score, fx 4.6
  reviews?: number | null; // eget antal anmeldelser
  top3AvgRating?: number | null; // snit for top-3 i samme søgning
  top3AvgReviews?: number | null;
}

export interface BookingAudit {
  relevant: boolean; // only salons/restaurants and friends get the audit
  found: boolean;
  system: string | null;
  note: string;
}

export interface PlainFix {
  title: string;
  why: string;
  how: string;
}

export interface SeoTjekReport {
  submissionId: string;
  url: string;
  host: string;
  ranAt: string;
  seo: SeoResult;
  desktop: LighthouseScores | null;
  localRank: LocalRankResult | null;
  booking: BookingAudit;
  fixes: PlainFix[];
}

export interface SeoTjekStats {
  submissions: number;
  reports: number;
  day0Sent: number;
  day7Sent: number;
  unsubscribes: number;
  honeypot: number;
}

// ---- validation (pure) ------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type ValidatedSubmission =
  | { ok: true; url: string; email: string; branch?: string; city?: string }
  | { ok: false; error: string };

export function validateSubmission(input: unknown): ValidatedSubmission {
  if (!input || typeof input !== "object") return { ok: false, error: "Tomt input." };
  const o = input as Record<string, unknown>;
  if (o.consent !== true) return { ok: false, error: "Du skal give samtykke til at modtage rapporten på mail." };

  const email = String(o.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Skriv en gyldig mailadresse." };

  let raw = String(o.url ?? "").trim();
  if (!raw) return { ok: false, error: "Skriv din hjemmeside-adresse." };
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: "Det ligner ikke en hjemmeside-adresse." };
  }
  if (!/^https?:$/.test(parsed.protocol)) return { ok: false, error: "Kun http/https-adresser." };
  const host = parsed.hostname.toLowerCase();
  // Public sites only — block SSRF-ish targets (localhost, bare IPs, single-label hosts).
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
  if (isIp || host === "localhost" || !host.includes(".") || host.endsWith(".local")) {
    return { ok: false, error: "Skriv din offentlige hjemmeside-adresse (fx dinside.dk)." };
  }
  const url = `${parsed.protocol.toLowerCase()}//${host}${parsed.pathname === "/" ? "" : parsed.pathname}`;

  const branch = String(o.branch ?? "").trim() || undefined;
  const city = String(o.city ?? "").trim() || undefined;
  return { ok: true, url, email, branch, city };
}

export function hostOfUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ---- booking audit (pure) ---------------------------------------------------

const BOOKING_RELEVANT_RE = /frisør|frisor|salon|barber|negle|hud|skønhed|skonhed|kosmet|spa|wellness|klinik|massage|tatov|tandlæge|tandlaege|fysio|fitness|træn|traen|restaurant|café|cafe|pizz|\bbar\b|grill|kro|bistro|spise/i;

const BOOKING_SYSTEMS: Array<[RegExp, string]> = [
  [/planway/i, "Planway"],
  [/treatwell/i, "Treatwell"],
  [/fresha/i, "Fresha"],
  [/salonized/i, "Salonized"],
  [/bookatable/i, "Bookatable"],
  [/dinnerbooking/i, "DinnerBooking"],
  [/easytable/i, "easyTable"],
  [/resdiary/i, "ResDiary"],
  [/opentable/i, "OpenTable"],
  [/superb\w*\.\w/i, "Superb"],
  [/onlinebooq/i, "OnlineBooq"],
  [/terminland/i, "Terminland"],
  [/calendly/i, "Calendly"],
];

export function detectBookingSystem(html: string, branch?: string): BookingAudit {
  const relevant = BOOKING_RELEVANT_RE.test(branch || "");
  const h = html || "";
  for (const [re, name] of BOOKING_SYSTEMS) {
    if (re.test(h)) {
      return { relevant, found: true, system: name, note: `Online booking fundet (${name}).` };
    }
  }
  // Generic self-hosted booking links ("/book-tid", "bestil tid" button etc.).
  if (/href=["'][^"']*(book|bestil)[-_]?(tid|bord|online|nu)/i.test(h) || /\b(book|bestil)\s+(tid|bord|online)\b/i.test(h)) {
    return { relevant, found: true, system: "eget booking-link", note: "Online booking-link fundet på siden." };
  }
  return {
    relevant,
    found: false,
    system: null,
    note: relevant
      ? "Ingen online booking fundet. Kunder der ikke kan bestille tid eller bord online, ringer ofte aldrig."
      : "Booking-tjek er mest relevant for saloner og restauranter.",
  };
}

// ---- local rank matching (pure part) ----------------------------------------

export function matchRank(
  places: Array<{ title: string; website?: string | null }>,
  host: string,
  name?: string,
): number | null {
  const target = (host || "").toLowerCase().replace(/^www\./, "");
  const nameKey = (name || "").toLowerCase().replace(/[^a-zæøå0-9]/g, "");
  for (let i = 0; i < places.length; i++) {
    const site = (places[i].website || "").toLowerCase();
    if (target && site) {
      try {
        if (new URL(site).hostname.replace(/^www\./, "") === target) return i + 1;
      } catch { /* bad website value from Places — fall through to name match */ }
    }
    const titleKey = (places[i].title || "").toLowerCase().replace(/[^a-zæøå0-9]/g, "");
    if (nameKey && titleKey && titleKey === nameKey) return i + 1;
  }
  return null;
}

// ---- plain-Danish top-3 fixes (pure) -----------------------------------------
// One rule: no jargon. A café owner must understand every line.

export function plainFixes(seo: SeoResult, booking: BookingAudit, localRank: LocalRankResult | null): PlainFix[] {
  const out: Array<PlainFix & { w: number }> = [];
  const perf = seo.lighthouse?.scores?.performance;

  if (perf != null && perf < 50) {
    out.push({
      w: 10,
      title: "Din side er langsom, især på mobil",
      why: `Google giver din side ${perf} ud af 100 i hastighed. Langsomme sider ryger ned i søgeresultaterne, og op mod halvdelen af besøgende forlader en side der tager over 3 sekunder at åbne.`,
      how: "Gør billederne mindre (de fleste kan komprimeres 80 procent uden synlig forskel) og fjern plugins eller scripts der ikke bruges. En udvikler kan typisk løse det på en dag.",
    });
  }
  if (booking.relevant && !booking.found) {
    // Weighted ABOVE speed (council fund): for a salon/restaurant, missing
    // online booking is a direct revenue blocker, not a nice-to-have.
    out.push({
      w: 12,
      title: "Kunder kan ikke bestille tid eller bord online",
      why: "Mange kunder tjekker jer om aftenen, når telefonen er lukket. Uden online booking vælger de en konkurrent der har det.",
      how: "Opret gratis eller billig online booking (fx Planway til saloner eller DinnerBooking til restauranter) og læg knappen øverst på forsiden.",
    });
  }
  if (seo.schema && !seo.schema.found) {
    out.push({
      w: 7,
      title: "Google mangler basisoplysninger om din forretning",
      why: "Når nogen søger jer frem, kan Google ikke vise åbningstider, adresse og branche rigtigt, fordi siden ikke serverer oplysningerne i det format Google læser. Det koster synlighed i lokale søgninger og i Google Maps.",
      how: "Der skal et lille stykke standardkode ind på siden med navn, adresse og branche. Rapporten her indeholder koden klar til at sætte ind, det tager en udvikler 10 minutter.",
    });
  }
  if (localRank?.available && (localRank.position == null || localRank.position > 3)) {
    out.push({
      w: 6,
      title: localRank.position == null
        ? `I dukker slet ikke op når folk søger "${localRank.query}"`
        : `I ligger nr. ${localRank.position} når folk søger "${localRank.query}"`,
      why: "De tre øverste i Google Maps får langt de fleste klik og opkald. Alt under top 3 er næsten usynligt for nye kunder.",
      how: "Opdater jeres Google-profil (åbningstider, billeder, svar på anmeldelser) og bed tilfredse kunder om en anmeldelse. Det flytter placeringen mere end noget andet.",
    });
  }
  // Anmeldelses-gab: kun når vi kender både egne tal og toppens snit, og
  // gabet er tydeligt (under halvdelen af toppens antal). Anmeldelser flytter
  // Maps-placering, så det her er en gør-det-selv-fix ejeren kan starte i dag.
  if (
    localRank?.available &&
    localRank.reviews != null &&
    localRank.top3AvgReviews != null &&
    // Stort gab i normale byer, ELLER næsten ingen anmeldelser i små byer
    // (dér er 3 anmeldelser mod toppens 12 stadig et reelt problem).
    ((localRank.top3AvgReviews > 20 && localRank.reviews < localRank.top3AvgReviews / 2) ||
      (localRank.reviews < 5 && localRank.top3AvgReviews > 5))
  ) {
    out.push({
      w: 6,
      title: `I har ${localRank.reviews} Google-anmeldelser (toppen har i snit ${Math.round(localRank.top3AvgReviews)})`,
      why: "Antal og friskhed af anmeldelser er en af de tungeste faktorer for placeringen i Google Maps, og kunder vælger ofte stedet med flest stjerner og anmeldelser.",
      how: "Bed jeres gladeste kunder om en anmeldelse — et lille skilt ved kassen eller et link i kvitteringsmailen virker. 2-3 nye om ugen flytter mærkbart på et par måneder.",
    });
  }
  const geo = seo.geo;
  if (geo && geo.aiCrawlersAllowed === false) {
    out.push({
      w: 5,
      title: "ChatGPT og andre AI-tjenester er blokeret fra din side",
      why: `Din side beder AI-tjenester (${geo.blockedBots.join(", ")}) om at holde sig væk. Flere og flere finder lokale steder ved at spørge ChatGPT, og de kan ikke anbefale jer, hvis de ikke må læse siden.`,
      how: "Fjern blokeringen i den lille fil der hedder robots.txt. Det er en enkelt linje der skal rettes.",
    });
  }
  const onPageMap: Record<string, PlainFix & { w: number }> = {
    "Sidetitel": {
      w: 5,
      title: "Din side mangler en god titel i Google",
      why: "Titlen er den blå linje folk ser i søgeresultatet. Mangler den, gætter Google selv, og resultatet ser sjusket ud.",
      how: "Giv forsiden en titel som \"[Jeres navn] i [by] - [hvad I laver]\". Det kan gøres i jeres hjemmeside-system på 5 minutter.",
    },
    "Meta-beskrivelse": {
      w: 4,
      title: "Google viser ingen god beskrivelse af jer",
      why: "De to linjer tekst under titlen i søgeresultatet er jeres gratis annonce. Uden dem klipper Google et tilfældigt stykk tekst fra siden.",
      how: "Skriv 1-2 sætninger om hvad I tilbyder og hvorfor man skal vælge jer, og læg dem ind som beskrivelse i jeres hjemmeside-system.",
    },
    "HTTPS": {
      w: 9,
      title: "Din side er ikke sikker (mangler hængelåsen)",
      why: "Browsere viser \"ikke sikker\" ved siden af jeres adresse. Det skræmmer kunder væk, og Google straffer det.",
      how: "Bed jeres webhost om at slå et gratis SSL-certifikat til. Det tager dem få minutter.",
    },
    "Mobil-viewport": {
      w: 6,
      title: "Din side er ikke sat op til mobiltelefoner",
      why: "Over halvdelen af jeres besøgende sidder på mobilen. Uden mobilopsætning skal de zoome og knibe for at læse siden.",
      how: "Jeres hjemmeside-system skal have slået mobilvisning til, eller siden skal skiftes til en moderne skabelon.",
    },
  };
  for (const c of seo.onPage?.checks ?? []) {
    if (!c.ok && onPageMap[c.label]) out.push(onPageMap[c.label]);
  }
  if (geo && !geo.llmsTxt && out.length < 6) {
    out.push({
      w: 2,
      title: "Din side er ikke gjort klar til AI-søgning",
      why: "ChatGPT og Google AI henter i stigende grad svar direkte fra hjemmesider. Sider der er gjort klar til det, bliver oftere nævnt og anbefalet.",
      how: "Få lavet en kort \"om os\"-fil (llms.txt) og sørg for klare overskrifter og punktlister på siden, så AI kan citere jer korrekt.",
    });
  }

  return out
    .sort((a, b) => b.w - a.w)
    .slice(0, 3)
    .map(({ title, why, how }) => ({ title, why, how }));
}

// ---- report HTML (pure) ------------------------------------------------------

function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function scoreColor(n: number | null | undefined): string {
  if (n == null) return "#9ca3af";
  return n >= 90 ? "#15803d" : n >= 50 ? "#b45309" : "#b91c1c";
}

function scoreCircle(label: string, n: number | null | undefined): string {
  const v = n == null ? "?" : String(n);
  return `<div class="score"><div class="ring" style="border-color:${scoreColor(n)};color:${scoreColor(n)}">${v}</div><div class="slabel">${esc(label)}</div></div>`;
}

/**
 * The full report as a self-contained HTML fragment (or standalone document
 * with opts.standalone) — used by the /seo-tjek/rapport/[id] page AND written
 * to disk by the CLI runner. Print CSS included so "Gem som PDF" (window.print)
 * gives a clean PDF; deliberately no PDF library.
 */
// Google-anmeldelser som social proof i rapporten. Dansk talformat (komma).
function reviewsLine(lr: LocalRankResult): string {
  if (lr.rating == null || lr.reviews == null) return "";
  const da = (n: number) => n.toLocaleString("da-DK");
  let line = `Jeres Google-anmeldelser: <strong>${da(lr.rating)} stjerner (${da(lr.reviews)} anmeldelser)</strong>.`;
  if (lr.top3AvgRating != null) {
    line += ` Top-3 i søgningen har i snit ${da(lr.top3AvgRating)} stjerner${lr.top3AvgReviews != null ? ` og ${da(lr.top3AvgReviews)} anmeldelser` : ""}.`;
  }
  return `<p>${line}</p>`;
}

export function renderReportHtml(r: SeoTjekReport, opts: { standalone?: boolean; bookingUrl?: string } = {}): string {
  const s = r.seo;
  const m = s.lighthouse?.scores ?? null;
  const date = r.ranAt.slice(0, 10);
  const bookingUrl = opts.bookingUrl || "mailto:buur.aigro@gmail.com?subject=SEO-tjek%20opf%C3%B8lgning";

  const aiRows: Array<[string, boolean | null, string]> = [
    ["Struktureret data (Google forstår hvem I er)", s.schema ? s.schema.found : null, s.schema?.found ? `Fundet: ${esc(s.schema.types.slice(0, 4).join(", "))}` : "Mangler. Færdig kode ligger nederst i rapporten."],
    ["AI-tjenester må læse siden", s.geo ? s.geo.aiCrawlersAllowed !== false : null, s.geo?.aiCrawlersAllowed === false ? `Blokeret: ${esc(s.geo.blockedBots.join(", "))}` : "Ja, ChatGPT og co. kan læse siden."],
    ["AI-fil (llms.txt)", s.geo ? s.geo.llmsTxt : null, s.geo?.llmsTxt ? "Fundet." : "Mangler. En kort fil der hjælper AI med at forstå jer."],
    ["Tekst AI kan citere", null, esc(s.geo?.citabilityNote ?? "")],
  ];
  const aiTable = aiRows.map(([label, ok, detail]) => {
    const mark = ok === null ? "•" : ok ? "✓" : "✗";
    const color = ok === null ? "#6b7280" : ok ? "#15803d" : "#b91c1c";
    return `<tr><td style="color:${color};font-weight:700;width:1.5rem">${mark}</td><td><strong>${esc(label)}</strong><br><span class="muted">${detail}</span></td></tr>`;
  }).join("");

  const fixes = r.fixes.map((f, i) => `
    <div class="fix">
      <div class="fixnum">${i + 1}</div>
      <div>
        <h3>${esc(f.title)}</h3>
        <p><strong>Hvorfor det koster kunder:</strong> ${esc(f.why)}</p>
        <p><strong>Sådan løses det:</strong> ${esc(f.how)}</p>
      </div>
    </div>`).join("");

  const rankBlock = r.localRank?.available
    ? `<p>Vi søgte <strong>"${esc(r.localRank.query)}"</strong> på Google Maps. ${
        r.localRank.position == null
          ? `Jeres side var <strong>ikke blandt de ${r.localRank.total} første</strong> resultater.`
          : `I ligger <strong>nr. ${r.localRank.position} af ${r.localRank.total}</strong>.`
      }${r.localRank.topNames.length ? ` Toppen lige nu: ${esc(r.localRank.topNames.slice(0, 3).join(", "))}.` : ""}</p>${reviewsLine(r.localRank)}`
    : `<p class="muted">Lokal placering ikke målt (${esc(r.localRank?.note || "mangler by/branche")}).</p>`;

  const bookingBlock = r.booking.relevant
    ? `<h2>Online booking</h2><p>${r.booking.found ? `✓ ${esc(r.booking.note)}` : `✗ ${esc(r.booking.note)}`}</p>`
    : "";

  const schemaBlock = s.schemaSuggestion
    ? `<h2>Færdig kode til Google (sæt ind og gem)</h2><p class="muted">Giv den her til jeres udvikler eller webbureau. Den fortæller Google navn, by og branche.</p><pre>${esc(s.schemaSuggestion)}</pre>`
    : "";

  const body = `
  <div class="report">
    <header>
      <p class="kicker">Gratis SEO- og AI-tjek</p>
      <h1>${esc(r.host)}</h1>
      <p class="muted">Kørt ${date} af Buur Web</p>
    </header>

    <h2>Hastighed og teknik (Google PageSpeed)</h2>
    <div class="scores">
      ${scoreCircle("Mobil", m?.performance)}
      ${scoreCircle("Desktop", r.desktop?.performance)}
      ${scoreCircle("SEO", m?.seo)}
      ${scoreCircle("Tilgængelighed", m?.accessibility)}
    </div>
    <p class="muted">90+ er godt, 50-89 bør forbedres, under 50 koster kunder. ${esc(s.lighthouse?.note ?? "")}</p>

    <h2>De 3 vigtigste ting at fikse</h2>
    ${fixes || `<p>Ingen kritiske problemer fundet. Flot side. Vil du holde den sådan, og komme foran i AI-søgning før konkurrenterne? <a href="${esc(bookingUrl)}">Book 15 minutter her</a>.</p>`}

    <h2>Kan ChatGPT og Google AI finde jer?</h2>
    <table class="ai">${aiTable}</table>

    <h2>Lokal placering</h2>
    ${rankBlock}
    ${bookingBlock}
    ${schemaBlock}

    <div class="cta noprint">
      <h2>Vil du have det fikset?</h2>
      <p>Book 15 minutter, så gennemgår vi rapporten sammen og du får en konkret plan. Det er gratis og uforpligtende.</p>
      <a class="btn" href="${esc(bookingUrl)}">Book 15 minutter her</a>
    </div>
  </div>`;

  const css = `
  .report{max-width:720px;margin:0 auto;padding:2rem 1.25rem;font-family:ui-sans-serif,system-ui,sans-serif;color:#1f2937;line-height:1.55}
  .report h1{font-size:1.8rem;margin:.2rem 0}
  .report h2{font-size:1.15rem;margin:2rem 0 .6rem;border-bottom:1px solid #e5e7eb;padding-bottom:.3rem}
  .report h3{font-size:1rem;margin:.1rem 0 .4rem}
  .kicker{text-transform:uppercase;letter-spacing:.08em;font-size:.75rem;color:#6b7280;margin:0}
  .muted{color:#6b7280;font-size:.85rem}
  .scores{display:flex;gap:1.25rem;flex-wrap:wrap;margin:.75rem 0}
  .score{text-align:center}
  .ring{width:64px;height:64px;border:4px solid;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.15rem}
  .slabel{font-size:.75rem;margin-top:.35rem;color:#374151}
  .fix{display:flex;gap:.9rem;margin:1rem 0;padding:1rem;background:#f9fafb;border-radius:10px}
  .fixnum{flex:0 0 2rem;height:2rem;border-radius:50%;background:#1f2937;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700}
  table.ai{border-collapse:collapse;width:100%}
  table.ai td{padding:.45rem .3rem;border-bottom:1px solid #f3f4f6;vertical-align:top}
  pre{background:#f3f4f6;padding:1rem;border-radius:8px;overflow-x:auto;font-size:.75rem}
  .cta{margin:2.5rem 0 1rem;padding:1.5rem;background:#1f2937;color:#f9fafb;border-radius:12px;text-align:center}
  .cta h2{border:none;color:#fff;margin-top:0}
  .btn{display:inline-block;background:#f9fafb;color:#1f2937;padding:.7rem 1.4rem;border-radius:8px;font-weight:700;text-decoration:none;margin-top:.5rem}
  @media print{.noprint{display:none}.report{padding:0}body{background:#fff}}`;

  if (opts.standalone) {
    return `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>SEO-tjek: ${esc(r.host)}</title><style>${css}</style></head><body>${body}</body></html>`;
  }
  return `<style>${css}</style>${body}`;
}

// ---- mails (pure) -------------------------------------------------------------
// Copy rules: plain Danish, no em-dashes, no emojis, visible unsubscribe.

function unsubscribeUrl(sub: SeoTjekSubmission, reportUrl: string): string {
  const base = reportUrl.replace(/\/seo-tjek\/rapport\/.*$/, "");
  return `${base}/api/seo-tjek/unsubscribe?id=${encodeURIComponent(sub.id)}`;
}

function mailHtml(paragraphs: string[], ctaText: string, ctaUrl: string, unsubUrl: string): string {
  const ps = paragraphs.map((p) => `<p style="margin:0 0 1em">${p}</p>`).join("");
  return `<div style="font-family:ui-sans-serif,system-ui,sans-serif;font-size:15px;color:#1f2937;line-height:1.6;max-width:560px">
${ps}
<p style="margin:1.2em 0"><a href="${ctaUrl}" style="background:#1f2937;color:#ffffff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700">${ctaText}</a></p>
<p style="margin:2em 0 0;font-size:12px;color:#9ca3af">Du får denne mail, fordi du bad om et gratis SEO-tjek. Vil du ikke høre mere fra os? <a href="${unsubUrl}" style="color:#9ca3af">Afmeld her</a>.</p>
</div>`;
}

// Direkte booking-link (Cal.com el.lign.) i funnel-mails. Samme env som
// rapport-siden bruger; tom streng = ingen ekstra linje (CTA'en er så "svar
// på mailen"), aldrig en død placeholder.
export function bookingUrlFromEnv(): string | null {
  const u = (process.env.SEO_TJEK_BOOKING_URL || "").trim();
  return u || null;
}
function bookingLineText(): string {
  const u = bookingUrlFromEnv();
  return u ? `\n\nBook direkte i kalenderen (15 min, gratis): ${u}` : "";
}
function bookingLineHtml(): string {
  const u = bookingUrlFromEnv();
  return u ? ` <a href="${esc(u)}">Book direkte i kalenderen her (15 min, gratis)</a>.` : "";
}

export function day0Mail(sub: SeoTjekSubmission, report: SeoTjekReport, reportUrl: string): { subject: string; text: string; html: string } {
  const host = hostOfUrl(sub.url);
  const topFix = report.fixes[0];
  const unsub = unsubscribeUrl(sub, reportUrl);
  const fixLines = topFix
    ? `Den vigtigste ting at fikse først:\n\n${topFix.title}\n${topFix.why}\nSådan løses det: ${topFix.how}`
    : "Din side klarer sig faktisk fint. Rapporten viser detaljerne.";
  const subject = `Din SEO-rapport for ${host} er klar`;
  const text = [
    `Hej,`,
    ``,
    `Tak fordi du bad om et gratis SEO-tjek af ${host}. Rapporten er klar her:`,
    ``,
    reportUrl,
    ``,
    fixLines,
    ``,
    `Vil du have det fikset? Book 15 minutter, så gennemgår vi rapporten sammen. Gratis og uforpligtende. Vi har senest løftet Vida Klinik til 90+ i Googles hastighedstest på alle punkter.${bookingLineText()}`,
    ``,
    `Mvh, Lucas`,
    `Buur Web`,
    ``,
    `Du får denne mail, fordi du bad om et gratis SEO-tjek. Har du ikke bedt om det, kan du bare ignorere mailen. Afmeld: ${unsub}`,
  ].join("\n");
  const html = mailHtml(
    [
      `Hej,`,
      `Tak fordi du bad om et gratis SEO-tjek af <strong>${esc(host)}</strong>. Rapporten er klar, og du kan også gemme den som PDF.`,
      topFix ? `<strong>Den vigtigste ting at fikse først: ${esc(topFix.title)}.</strong> ${esc(topFix.why)}` : `Din side klarer sig faktisk fint. Rapporten viser detaljerne.`,
      `Vil du have det fikset? Svar på denne mail eller book 15 minutter, så gennemgår vi rapporten sammen. Gratis og uforpligtende. Vi har senest løftet Vida Klinik til 90+ i Googles hastighedstest på alle punkter.${bookingLineHtml()}`,
      `Mvh, Lucas<br>Buur Web`,
    ],
    "Se din rapport",
    reportUrl,
    unsub,
  );
  return { subject, text, html };
}

export function day7Mail(sub: SeoTjekSubmission, reportUrl: string): { subject: string; text: string; html: string } {
  const host = hostOfUrl(sub.url);
  const unsub = unsubscribeUrl(sub, reportUrl);
  const subject = `Kom der noget ud af SEO-rapporten for ${host}?`;
  const text = [
    `Hej,`,
    ``,
    `For en uge siden fik du en SEO-rapport for ${host}. Jeg ville bare høre om du fik kigget på den? Et eksempel på hvad den slags gennemgang kan flytte: Vida Klinik scorer nu 90+ i Googles hastighedstest på alle punkter efter deres gennemgang.`,
    ``,
    `Rapporten ligger stadig her: ${reportUrl}`,
    ``,
    `Hvis du vil have en fast hånd om jeres synlighed, tilbyder jeg en månedlig ordning: jeg overvåger siden, retter det der driller og sender en kort rapport hver måned. Skal vi tage 15 minutter om det?${bookingLineText()}`,
    ``,
    `Mvh, Lucas`,
    `Buur Web`,
    ``,
    `Afmeld: ${unsub}`,
  ].join("\n");
  const html = mailHtml(
    [
      `Hej,`,
      `For en uge siden fik du en SEO-rapport for <strong>${esc(host)}</strong>. Jeg ville bare høre om du fik kigget på den? Et eksempel på hvad den slags gennemgang kan flytte: <strong>Vida Klinik</strong> scorer nu 90+ i Googles hastighedstest på alle punkter efter deres gennemgang.`,
      `Hvis du vil have en fast hånd om jeres synlighed, tilbyder jeg en månedlig ordning: jeg overvåger siden, retter det der driller og sender en kort rapport hver måned. Skal vi tage 15 minutter om det?${bookingLineHtml()}`,
      `Mvh, Lucas<br>Buur Web`,
    ],
    "Se rapporten igen",
    reportUrl,
    unsub,
  );
  return { subject, text, html };
}

// ---- network: desktop PageSpeed ------------------------------------------------

export async function runDesktopPageSpeed(url: string): Promise<LighthouseScores | null> {
  try {
    const params = new URLSearchParams({ url, strategy: "desktop" });
    for (const c of ["performance", "accessibility", "best-practices", "seo"]) params.append("category", c);
    if (process.env.PAGESPEED_API_KEY) params.set("key", process.env.PAGESPEED_API_KEY);
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`, {
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { lighthouseResult?: { categories?: Record<string, { score: number | null }> } };
    const c = data.lighthouseResult?.categories;
    if (!c) return null;
    const pct = (s: number | null | undefined) => Math.round((s ?? 0) * 100);
    return {
      performance: pct(c.performance?.score),
      accessibility: pct(c.accessibility?.score),
      bestPractices: pct(c["best-practices"]?.score),
      seo: pct(c.seo?.score),
    };
  } catch {
    return null;
  }
}

// ---- network: local rank via Google Places -------------------------------------

export async function runLocalRank(host: string, name: string, branch?: string, city?: string): Promise<LocalRankResult> {
  const empty = (note: string): LocalRankResult => ({ available: false, query: "", position: null, total: 0, topNames: [], note });
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return empty("Ingen GOOGLE_PLACES_API_KEY.");
  if (!branch || !city) return empty("Mangler branche eller by for lokal-søgning.");
  const query = `${branch} i ${city}`;
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.displayName,places.websiteUri,places.rating,places.userRatingCount",
      },
      body: JSON.stringify({ textQuery: query, languageCode: "da", maxResultCount: 20, regionCode: "DK" }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return { ...empty(`Places svarede ${res.status}.`), query };
    const data = (await res.json()) as { places?: Array<{ displayName?: { text?: string }; websiteUri?: string; rating?: number; userRatingCount?: number }> };
    const places = (data.places ?? []).map((p) => ({
      title: p.displayName?.text ?? "",
      website: p.websiteUri ?? null,
      rating: typeof p.rating === "number" ? p.rating : null,
      reviews: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
    }));
    const position = matchRank(places, host, name);
    // Anmeldelses-snit for toppen + egne tal (kun når vi fandt virksomheden).
    const top3 = places.slice(0, 3).filter((p) => p.rating != null);
    const avg = (xs: number[]): number | null => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
    const own = position != null ? places[position - 1] : null;
    return {
      available: true,
      query,
      position,
      total: places.length,
      topNames: places.slice(0, 3).map((p) => p.title).filter(Boolean),
      note: position == null ? "Ikke fundet i top-resultaterne." : `Placering ${position} af ${places.length}.`,
      rating: own?.rating ?? null,
      reviews: own?.reviews ?? null,
      top3AvgRating: avg(top3.map((p) => p.rating as number)),
      top3AvgReviews: avg(top3.map((p) => p.reviews ?? 0).filter((n) => n > 0)),
    };
  } catch (err) {
    return { ...empty(`Places-kald fejlede: ${String(err).slice(0, 80)}`), query };
  }
}

// ---- orchestrator ----------------------------------------------------------------

/**
 * Run the whole free check for a validated submission. Never throws — every
 * sub-check degrades to null-with-note so the visitor always gets a report.
 */
export async function runFreeCheck(sub: SeoTjekSubmission): Promise<SeoTjekReport> {
  const host = hostOfUrl(sub.url);
  const name = host.replace(/\.(dk|com|net|org|nu|eu)$/i, "").replace(/[-_.]/g, " ").trim();

  const seo = await runSeoChecks({ name, city: sub.city, domain: sub.url, branch: sub.branch });

  // Branch fallback: if the visitor skipped the field, guess from the schema type
  // or page title so the booking audit still has something to go on.
  const branchGuess = sub.branch || (seo.schema?.types.join(" ") ?? "");

  // Re-fetch of the raw HTML is avoided: runSeoChecks already fetched it, but does
  // not expose it. Booking detection re-fetches once (cheap) rather than widening
  // seo.ts's public surface.
  let html = "";
  try {
    const res = await fetch(sub.url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" },
      signal: AbortSignal.timeout(9000),
    });
    // Size guard (council fund): a hostile target must not buffer gigabytes
    // into the function. Skip clearly-huge bodies, truncate the rest.
    const len = parseInt(res.headers.get("content-length") || "0", 10);
    if (res.ok && (!Number.isFinite(len) || len < 3_000_000)) {
      html = (await res.text()).slice(0, 2_000_000);
    }
  } catch { /* booking audit degrades below */ }

  const booking = detectBookingSystem(html, branchGuess);

  // City fallback for the local-rank check: schema address is not exposed either,
  // so we only run it when the visitor gave a city (form field) or branch guess.
  const [desktop, localRank] = await Promise.all([
    runDesktopPageSpeed(sub.url),
    runLocalRank(host, name, sub.branch, sub.city),
  ]);

  const fixes = plainFixes(seo, booking, localRank.available ? localRank : null);

  return {
    submissionId: sub.id,
    url: sub.url,
    host,
    ranAt: new Date().toISOString(),
    seo,
    desktop,
    localRank,
    booking,
    fixes,
  };
}

// ---- stats helper (lazy store) -----------------------------------------------------

// Flat keys (no slash): FSStore.list only sees top-level .send_queue entries.
export const STATS_KEY = "seo-tjek-stats";
export const SUB_PREFIX = "seo-tjek-sub-";
export const REPORT_PREFIX = "seo-tjek-report-";

export async function bumpStats(field: keyof SeoTjekStats): Promise<void> {
  try {
    const { store } = await import("./store.ts");
    const cur = (await store.get<SeoTjekStats>(STATS_KEY)) ?? { submissions: 0, reports: 0, day0Sent: 0, day7Sent: 0, unsubscribes: 0, honeypot: 0 };
    cur[field] = (cur[field] ?? 0) + 1;
    await store.put(STATS_KEY, cur);
  } catch { /* tracking is best-effort, never blocks the funnel */ }
}
