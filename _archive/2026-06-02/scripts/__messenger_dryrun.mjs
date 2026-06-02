// Dry-run candidate query for lead-messenger-morning
import { google } from "googleapis";
import fs from "fs";

const envText = fs.readFileSync(".env.local", "utf8");
envText.split(/\r?\n/).forEach(line => {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
});

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const KEY_FILE = process.env.GOOGLE_KEY_FILE;

const JYSK_TRADE_WORDS = ["tømrer","el ","elteknik","vvs","byg","service","anlæg","gartner","rengøring","kloak","tagpap","vinduespudsning","polering","hjemmepleje","maler","murer","bogføring","revision","teknik","auto","fysio","care"];
const CHAIN_EXACT = ["lidl","aldi","zara","ikea","matas","stark","shell","subway","bones","flammen","sticks'n'sushi","cofoco","sunset boulevard","joe & the juice","joe and the juice","espresso house","baresso","pizza hut","domino's","papa john's","kfc","taco bell","wendy's"];
const CHAIN_CONTAINS = ["synoptik","profiloptik","specsavers","fielmann","louis nielsen","elgiganten","power electronics","power (elektronik","harold nyborg","mcdonalds","mcdonald's","mcdonald","burger king","7-eleven","starbucks","domino","pizza king","wingstop","wagamama","hereford beefstouw","lagkagehuset","riccos kaffebar","the union kitchen","sticks n sushi","sunset blvd","rema 1000","bilka","føtex","kvickly","coop","normal store","normal a/s","søstrene grene","flying tiger","tiger stores","h&m","sportsmaster","intersport","silvan","xl-byg","bauhaus","jem & fix","circle k","q8 energie","ok benzin","kvik køkken","fitness world","sats fitness","imerco","anicura","evidensia","deloitte","pwc","kpmg","ernst & young","bdo revision","colorama","cbre","pincho nation"];

function isChain(name) {
  const lower = (name || "").toLowerCase();
  if (/\bjysk\b/.test(lower) && !JYSK_TRADE_WORDS.some(w => lower.includes(w))) return true;
  if (/\bnetto\b/.test(lower) && !JYSK_TRADE_WORDS.some(w => lower.includes(w))) return true;
  if (/\bsalling\b/.test(lower) && !JYSK_TRADE_WORDS.some(w => lower.includes(w)) && !/v\/|aps|a\/s|i\/s/.test(lower)) return true;
  for (const c of CHAIN_EXACT) {
    const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp("\\b" + escaped + "\\b").test(lower)) return true;
  }
  return CHAIN_CONTAINS.some(c => lower.includes(c.toLowerCase()));
}

function isMessengerCandidate(lead) {
  const branchLower = (lead.branch || "").toLowerCase();
  const BEAUTY = ["frisør","skønhed","hud","negle","barber","kosmetolog","solcenter","salon","hår","hair","wellness"];
  if (!BEAUTY.some(k => branchLower.includes(k))) return false;

  const websiteLower = (lead.website || "").toLowerCase();
  const isFbOnly = websiteLower.includes("facebook.com") || (!lead.website && (lead.emailStatus || "") === "queue-messenger");
  if (!isFbOnly) return false;

  if (lead.email && lead.email.includes("@") && lead.email.toLowerCase() !== "none") return false;
  if ((lead.reviewsCount || 0) < 30) return false;

  const SKIP = ["skip","called","client","interested","skip-bounced","messenger-sent","messenger-replied"];
  if (SKIP.includes((lead.status || "").toLowerCase())) return false;
  if ((lead.emailStatus || "").toLowerCase() === "messenger-sent") return false;
  return true;
}

function extractReviews(enrichedInfo) {
  if (!enrichedInfo) return 0;
  try {
    const o = JSON.parse(enrichedInfo);
    return o.googleReviewCount || 0;
  } catch { return 0; }
}

function extractCityFromEnriched(enrichedInfo) {
  if (!enrichedInfo) return "";
  try { return JSON.parse(enrichedInfo).city || ""; } catch { return ""; }
}

async function main() {
  const auth = new google.auth.GoogleAuth({ keyFile: KEY_FILE, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  const sheets = google.sheets({ version: "v4", auth: await auth.getClient() });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: "Leads!A2:U" });
  const rows = res.data.values || [];
  console.log("Total rows in sheet: " + rows.length);

  // ACTUAL column mapping (from header inspection):
  // A=Name(0), B=Branch(1), C=Phone(2), D=City(3), E=Score(4), F=Source(5), G=Website(6),
  // H=WebsiteStatus(7), I=Status(8), J=Notes(9), K=LastUpdated(10), L=WebsiteQualityTier(11),
  // M=enrichedInfo-JSON(12), N=email(13), O=emailSentAt(14), R=emailStatus(17)
  const leads = rows.map((r, i) => ({
    rowIndex: i + 2,
    name: r[0] || "",
    branch: r[1] || "",
    phone: r[2] || "",
    city: r[3] || "",
    score: parseInt(r[4]) || 0,
    source: r[5] || "",
    website: r[6] || "",
    websiteStatus: r[7] || "",
    status: r[8] || "",
    notes: r[9] || "",
    websiteQualityTier: r[11] || "",
    enrichedInfo: r[12] || "",
    email: r[13] || "",
    emailSentAt: r[14] || "",
    emailStatus: r[17] || "",
    reviewsCount: parseInt(r[19]) || extractReviews(r[12] || ""),
  }));

  // Stats: how many beauty leads total?
  const BEAUTY = ["frisør","skønhed","hud","negle","barber","kosmetolog","solcenter","salon","hår","hair","wellness"];
  const beautyAll = leads.filter(l => BEAUTY.some(k => (l.branch||"").toLowerCase().includes(k)));
  console.log("Total beauty leads: " + beautyAll.length);

  const fbOnly = beautyAll.filter(l => (l.website||"").toLowerCase().includes("facebook.com"));
  console.log("Beauty + FB-only website: " + fbOnly.length);

  const fbNoEmail = fbOnly.filter(l => !(l.email && l.email.includes("@") && l.email.toLowerCase() !== "none"));
  console.log("Beauty + FB-only + no email: " + fbNoEmail.length);

  const fbNoEmail30 = fbNoEmail.filter(l => l.reviewsCount >= 30);
  console.log("Beauty + FB-only + no email + >=30 reviews: " + fbNoEmail30.length);

  // Top 10 with their reviews
  const withReviewsSorted = [...fbNoEmail].sort((a,b)=>b.reviewsCount-a.reviewsCount);
  console.log("\nTop 10 beauty+FB-only+noEmail by reviews (regardless of >=30):");
  withReviewsSorted.slice(0,10).forEach((c,i) => {
    console.log((i+1)+". "+c.name+" | "+c.branch+" | "+c.city+" | reviews="+c.reviewsCount+" | status="+(c.status||"-")+" | emailStatus="+(c.emailStatus||"-"));
  });

  const candidates = leads.filter(isMessengerCandidate);
  console.log("\nFinal candidates passing isMessengerCandidate: " + candidates.length);

  const chainFiltered = candidates.filter(l => isChain(l.name));
  const nonChain = candidates.filter(l => !isChain(l.name));
  console.log("After isChain filter: " + nonChain.length + " (filtered " + chainFiltered.length + " chains)");
  chainFiltered.forEach(c => console.log("  CHAIN: " + c.name + " | " + c.branch));

  nonChain.sort((a, b) => b.reviewsCount - a.reviewsCount);
  const top12 = nonChain.slice(0, 12);

  console.log("\n=== TOP 12 BY REVIEWS ===");
  top12.forEach((c, i) => {
    console.log((i+1) + ". " + c.name + " | " + c.branch + " | " + c.city + " | reviews=" + c.reviewsCount + " | website=" + c.website + " | email=" + (c.email||"-") + " | status=" + (c.status||"-") + " | emailStatus=" + (c.emailStatus||"-"));
  });

  const branchCounts = {};
  nonChain.forEach(l => { branchCounts[l.branch] = (branchCounts[l.branch] || 0) + 1; });
  console.log("\n=== BRANCH BREAKDOWN ===");
  Object.entries(branchCounts).sort((a,b) => b[1]-a[1]).forEach(e => console.log("  " + e[0] + ": " + e[1]));

  const out = {
    totalLeads: rows.length,
    beautyTotal: beautyAll.length,
    beautyFbOnly: fbOnly.length,
    beautyFbOnlyNoEmail: fbNoEmail.length,
    beautyFbOnlyNoEmail30reviews: fbNoEmail30.length,
    candidatesBeforeChain: candidates.length,
    candidatesAfterChain: nonChain.length,
    chainsFiltered: chainFiltered.map(c => ({ name: c.name, branch: c.branch })),
    branchBreakdown: branchCounts,
    top12: top12.map(c => ({
      rowIndex: c.rowIndex, name: c.name, branch: c.branch, city: c.city,
      website: c.website, reviewsCount: c.reviewsCount,
      email: c.email, status: c.status, emailStatus: c.emailStatus
    })),
    topFbNoEmailRegardlessOfReviews: withReviewsSorted.slice(0,15).map(c => ({
      name: c.name, branch: c.branch, city: c.city, reviewsCount: c.reviewsCount,
      website: c.website, status: c.status, emailStatus: c.emailStatus
    }))
  };
  fs.writeFileSync("__messenger_dryrun_result.json", JSON.stringify(out, null, 2));
  console.log("\nWrote: __messenger_dryrun_result.json");
}

main().catch(e => { console.error(e); process.exit(1); });
