// verify-signature.mjs — FINAL live-equivalent verification.
// Reproduces Vercel prod env exactly:
//   - LUCAS_SENDER_PHONE=+45 23 24 24 82
//   - GMAIL_USER + GMAIL_APP_PASSWORD set
//   - CHARLIE_GMAIL_USER + CHARLIE_GMAIL_APP_PASSWORD set
//   - NO CHARLIE_SENDER_PHONE / _TITLE / _TAGLINE
process.env.LUCAS_SENDER_PHONE = "+45 23 24 24 82";
process.env.GMAIL_USER = "lucas@kinly.dk";
process.env.GMAIL_APP_PASSWORD = "DUMMY_LUCAS_PW_VALUE";
process.env.CHARLIE_GMAIL_USER = "charlie@kinly.dk";
process.env.CHARLIE_GMAIL_APP_PASSWORD = "DUMMY_CHARLIE_PW_VALUE";

const { formatSignature, getSenderCreds } = await import("./src/lib/senders.ts");

const lucas = formatSignature("lucas");
const charlie = formatSignature("charlie");

console.log("=== PROD-LIVE EQUIVALENT (Vercel env vars) ===");
console.log("Lucas   sig:", JSON.stringify(lucas.text));
console.log("Charlie sig:", JSON.stringify(charlie.text));
console.log();
console.log("=== Verifikation (bruger-spec 2026-06-26) ===");
const checks = [
  ["Lucas officiel identitet", lucas.text.includes("Lucas Buur\nCo-founder\nlucas@kinly.dk")],
  ["Charlie officiel identitet", charlie.text.includes("Charlie Nielsen\nCo-founder\ncharlie@kinly.dk")],
  ["Charlie INGEN 'salgselev' i signatur", !charlie.text.toLowerCase().includes("salgselev")],
  ["Charlie INGEN 'Senior Funding Manager'", !charlie.text.includes("Senior")],
  ["Charlie INGEN 'Web-design'", !charlie.text.includes("Web-design")],
  ["Charlie har officiel footer", charlie.text.includes("EST · 2026 · HERNING · DK · KODET I DANMARK")],
  ['Charlie closing = "Mvh, Charlie Nielsen"', charlie.closing === "Mvh, Charlie Nielsen"],
  ['Charlie creds phone = officiel default', getSenderCreds("charlie")?.phone === "+45 42 25 32 62"],
  ['Lucas creds phone = "+45 23 24 24 82"', getSenderCreds("lucas")?.phone === "+45 23 24 24 82"],
  ["Lucas INGEN 'salgselev'", !lucas.text.toLowerCase().includes("salgselev")],
];
let pass = 0, fail = 0;
for (const [name, ok] of checks) {
  console.log((ok ? "✓ " : "✗ ") + name);
  ok ? pass++ : fail++;
}
console.log("\n=== " + pass + " PASS, " + fail + " FAIL af " + checks.length + " ===");
process.exit(fail > 0 ? 1 : 0);
