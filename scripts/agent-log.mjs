// Log en "færdig: X"-post i Kinly HQ fra Claude/Codex/Hermes (vises under Agenter).
// Brug: node --env-file=.env.local scripts/agent-log.mjs <actor> <type> "<tekst>" [kunde] [url]
//   actor: hermes|claude|codex|lucas|charlie   type: session|checkin|deploy
// Kræver HERMES_API_SECRET (+ valgfri APP_URL, ellers prod).
import crypto from "node:crypto";

const [actor, type, summary, company, url] = process.argv.slice(2);
const secret = (process.env.HERMES_API_SECRET || "").trim();
if (!actor || !type || !summary || !secret) {
  console.error("brug: agent-log.mjs <actor> <type> \"<tekst>\" [kunde] [url]  (HERMES_API_SECRET skal være sat)");
  process.exit(1);
}
const base = (process.env.APP_URL || "https://lead-finder-three-beta.vercel.app").replace(/\/$/, "");
const path = "/api/agent/log";
const body = JSON.stringify({ actor, type, summary, company, url });
const ts = String(Math.floor(Date.now() / 1000));
const sig = crypto.createHmac("sha256", secret).update(`${ts}.POST.${path}.${body}`, "utf-8").digest("hex");
const res = await fetch(base + path, {
  method: "POST",
  headers: { "content-type": "application/json", "x-timestamp": ts, authorization: `Bearer ${sig}` },
  body,
});
console.log(res.status, await res.text());
process.exit(res.ok ? 0 : 1);
