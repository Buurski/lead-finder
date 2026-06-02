// Generate 3 sample messages from 3 different candidates using the 3 templates
import fs from "fs";

const data = JSON.parse(fs.readFileSync("__messenger_dryrun_result.json", "utf8"));
const top = data.top12;

// Pick 3 with different review counts
const cands = [top[0], top[5], top[9]];

function extractHandle(website) {
  if (!website) return null;
  // Patterns:
  //  facebook.com/Handle/...    -> Handle
  //  facebook.com/p/Name-12345  -> p/Name-12345 (use ID)
  //  facebook.com/profile.php?id=12345 -> 12345
  try {
    const u = new URL(website);
    const path = u.pathname;
    const search = u.search;
    if (path.startsWith("/profile.php") && search.includes("id=")) {
      const id = search.match(/id=(\d+)/)?.[1];
      return id;
    }
    // Strip leading /
    const parts = path.replace(/^\//, "").split("/").filter(Boolean);
    if (parts.length === 0) return null;
    if (parts[0] === "p" && parts[1]) {
      // /p/Name-12345 -> use trailing numeric id if present
      const m = parts[1].match(/-(\d+)$/);
      return m ? m[1] : parts[1];
    }
    if (parts[0] === "pages" && parts[2]) {
      return parts[2]; // numeric id
    }
    return parts[0];
  } catch (e) { return null; }
}

function templateA(c) {
  return `Hej! Så lige jeres side med ${c.reviewsCount} anmeldelser — virkelig flot. Lagde mærke til at I kun har Facebook og ingen rigtig hjemmeside. Jeg laver hjemmesider som hobby ved siden af min salgselev-plads, så det er prisvenligt — kan sende en gratis demo hvis det er interessant.

Mvh, Lucas`;
}

function templateB(c) {
  return `Hej! Jeg sad og kiggede på ${c.city} området, og jeres salon ser virkelig solid ud. Bare overrasket over at I ikke har en rigtig hjemmeside — kunne være jeres næste vækst-trin. Jeg laver dem som hobby ved siden af min salgselev-plads, kan sende en gratis demo specifikt til jer hvis det er interessant.

Mvh, Lucas`;
}

function templateC(c) {
  return `Hej! Hurtigt spørgsmål — jeg så jeres FB-side med ${c.reviewsCount} anmeldelser, og tænker det må give jer mange bookings. Overvejer I en rigtig hjemmeside? Jeg laver dem som hobby ved siden af min salgselev-plads og kan sende en gratis demo hvis I vil se hvordan jeres ville se ud.

Mvh, Lucas`;
}

function validate(msg) {
  const issues = [];
  if (msg.length > 350) issues.push("OVER 350 chars (" + msg.length + ")");
  if (/\bkr\b|kroner|5k|alt inklusiv|fra \d+ kr/i.test(msg)) issues.push("contains kr/price");
  if (/skriv bare ja|send mockup|skriv tilbage/i.test(msg)) issues.push("hard CTA");
  if (!/Mvh, Lucas$/.test(msg.trim())) issues.push("missing Mvh, Lucas closing");
  if (!/\d+/.test(msg) && !/aaben|aabenraa|varde|thisted|fredericia|frederikshavn|billund|nørresundby|haderslev|vinderup/i.test(msg.toLowerCase())) {
    issues.push("no specific reference (number or city)");
  }
  return issues;
}

const templates = [templateA, templateB, templateC];
const labels = ["A (review-based)", "B (location-based)", "C (curiosity-based)"];

console.log("=== 3 SAMPLE MESSAGES ===\n");
cands.forEach((c, i) => {
  const tpl = templates[i];
  const msg = tpl(c);
  const handle = extractHandle(c.website);
  console.log("--- Candidate " + (i+1) + ": " + c.name + " (" + c.reviewsCount + " reviews, " + c.city + ") ---");
  console.log("Website: " + c.website);
  console.log("Extracted handle: " + handle);
  console.log("Messenger URL: https://www.facebook.com/messages/t/" + handle);
  console.log("Template: " + labels[i]);
  console.log("Message length: " + msg.length + " chars");
  const issues = validate(msg);
  console.log("Validation: " + (issues.length === 0 ? "PASS" : "FAIL — " + issues.join(", ")));
  console.log("---");
  console.log(msg);
  console.log("---\n");
});

// Also show handle extraction for ALL top12
console.log("\n=== HANDLE EXTRACTION FOR ALL 11 ===\n");
top.forEach((c, i) => {
  const h = extractHandle(c.website);
  console.log((i+1) + ". " + c.name + " -> handle=" + h + " (from " + c.website + ")");
});
