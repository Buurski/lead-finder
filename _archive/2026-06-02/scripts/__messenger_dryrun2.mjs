// Deeper investigation of why reviews are 0
import { google } from "googleapis";
import fs from "fs";

const envText = fs.readFileSync(".env.local", "utf8");
envText.split(/\r?\n/).forEach(line => {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
});

const auth = new google.auth.GoogleAuth({ keyFile: process.env.GOOGLE_KEY_FILE, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth: await auth.getClient() });
const res = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID, range: "Leads!A2:U" });
const rows = res.data.values || [];

// Pick beauty leads with FB-only website, inspect their enriched JSON and other columns
const BEAUTY = ["frisør","skønhed","hud","negle","barber","kosmetolog","solcenter","salon","hår","hair","wellness"];
const fbBeauty = rows.filter(r => BEAUTY.some(k => (r[1]||"").toLowerCase().includes(k)) && (r[6]||"").toLowerCase().includes("facebook.com"));
console.log("FB-only beauty leads: " + fbBeauty.length);

console.log("\nFirst 5 raw rows:");
fbBeauty.slice(0, 5).forEach((r, i) => {
  console.log("\n--- Row " + (i+1) + " ---");
  for (let j = 0; j < 21; j++) {
    const v = r[j];
    if (v && v.length > 200) console.log("Col " + j + " (" + String.fromCharCode(65+j) + "): " + v.substring(0,200) + "...");
    else console.log("Col " + j + " (" + String.fromCharCode(65+j) + "): " + (v || ""));
  }
});

// Count how many have enrichedInfo with googleReviewCount
let hasEnriched = 0, hasReviews = 0;
const reviewsBuckets = { "0": 0, "1-9": 0, "10-29": 0, "30-99": 0, "100+": 0 };
fbBeauty.forEach(r => {
  const ei = r[12];
  if (ei) hasEnriched++;
  try {
    const o = JSON.parse(ei || "{}");
    const rc = o.googleReviewCount;
    if (rc !== undefined) hasReviews++;
    if (rc === 0) reviewsBuckets["0"]++;
    else if (rc >= 1 && rc <= 9) reviewsBuckets["1-9"]++;
    else if (rc >= 10 && rc <= 29) reviewsBuckets["10-29"]++;
    else if (rc >= 30 && rc <= 99) reviewsBuckets["30-99"]++;
    else if (rc >= 100) reviewsBuckets["100+"]++;
  } catch {}
});
console.log("\nFB-only beauty leads with enrichedInfo populated: " + hasEnriched + "/" + fbBeauty.length);
console.log("FB-only beauty leads with googleReviewCount in JSON: " + hasReviews + "/" + fbBeauty.length);
console.log("Review buckets: " + JSON.stringify(reviewsBuckets));

// Also check column T (index 19) and U (20)
console.log("\nUnique values in col T (19) for FB-beauty:");
const tVals = new Set();
fbBeauty.forEach(r => tVals.add(r[19] || ""));
console.log([...tVals].slice(0,20));
console.log("Unique values in col U (20) for FB-beauty:");
const uVals = new Set();
fbBeauty.forEach(r => uVals.add(r[20] || ""));
console.log([...uVals].slice(0,20));

// Look at ALL leads with reviews populated to confirm where reviews live
console.log("\n--- Searching ALL leads for any with googleReviewCount in enrichedInfo ---");
let totalWithReviews = 0;
let highReview = [];
rows.forEach((r, i) => {
  try {
    const o = JSON.parse(r[12] || "{}");
    if (typeof o.googleReviewCount === "number") {
      totalWithReviews++;
      if (o.googleReviewCount >= 30) highReview.push({name: r[0], branch: r[1], reviews: o.googleReviewCount, website: r[6], email: r[13]});
    }
  } catch {}
});
console.log("Total leads with googleReviewCount: " + totalWithReviews);
console.log("Total leads with >=30 reviews: " + highReview.length);
console.log("Beauty leads with >=30 reviews:");
highReview.filter(l => BEAUTY.some(k => (l.branch||"").toLowerCase().includes(k))).slice(0,20).forEach(l => {
  console.log("  " + l.name + " | " + l.branch + " | reviews=" + l.reviews + " | website=" + l.website + " | email=" + l.email);
});
