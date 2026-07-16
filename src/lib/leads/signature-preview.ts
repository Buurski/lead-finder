// signature-preview.ts — client-safe sign-off preview + shared strip logic.
//
// Mirrors the formatting in src/lib/senders.ts so the /godkendelse preview
// matches what the send route actually emits. Kept separate because page.tsx
// is "use client" and senders.ts pulls in nodemailer (Node-only). Phone
// numbers are passed in (not read from process.env) so the bundle stays
// free of server-only code.
//
// 2026-07-16: stripSignature is now THE shared implementation — senders.ts
// imports it from here. Before this fix the two copies drifted: neither
// matched Charlie's rolle-linje ("Senior Funding Manager & Web-design
// entusiast") mellem navn og telefon, så et Charlie-signeret body blev aldrig
// strippet, og hvert Lucas/Charlie-toggle på /godkendelse stablede endnu en
// signaturblok i bunden. Strippen looper nu også (op til 10 blokke) i stedet
// for at stoppe efter første match, så gamle stablede drafts renses.

export type SenderId = "lucas" | "charlie";

// Kendte linjer der kan stå mellem navn og slut: titel/tagline (Charlie) og
// telefonnummer. Holdes eksplicitte så vi aldrig æder rigtig brødtekst.
const SIG_EXTRA_LINE = String.raw`(?:Senior Funding Manager[^\n]*|Web-design entusiast[^\n]*|Kinly[^\n]*|\+?[\d\s]{6,})`;

const SIGNATURE_PATTERNS: RegExp[] = [
  // "Med venlig hilsen" / "Mvh" + navn (evt. samme linje) + 0-3 kendte linjer.
  new RegExp(String.raw`\n+(?:Med venlig hilsen|Mvh),?\s*\n*(?:Lucas|Charlie)(?:\s+(?:Buur|Nielsen))?(?:\n${SIG_EXTRA_LINE}){0,4}\s*$`, "i"),
  // Navn + evt. rolle-linje + telefon (uden hilsen-linje).
  new RegExp(String.raw`\n+(?:Lucas|Charlie)(?:\s+(?:Buur|Nielsen))?(?:\n${SIG_EXTRA_LINE}){1,4}\s*$`, "i"),
  // Bare navnet som sidste linje.
  /\n+(?:Lucas|Charlie)(?:\s+(?:Buur|Nielsen))?\s*$/i,
];

/** Strip trailing sign-off block(s) so a body can be re-signed. Loops so
 *  stacked signatures (fra toggle-bug'en) også renses. */
export function stripSignature(body: string): string {
  let t = (body || "").replace(/\s+$/, "");
  for (let i = 0; i < 10; i++) {
    const before = t;
    for (const re of SIGNATURE_PATTERNS) {
      if (re.test(t)) { t = t.replace(re, "").replace(/\s+$/, ""); break; }
    }
    if (t === before) break;
  }
  return t;
}

/**
 * Render the signature block for the given sender.
 *  - Lucas: navn + telefon (hans eksisterende layout — bevarer diff)
 *  - Charlie: navn + (titel "&" tagline på ÉN linje) + telefon
 *    (midt­ertidig per Charlie 2026-06-26, indtil rigtig Gmail-signatur er sat)
 * Tomme felter filtres væk så vi aldrig emitterer blanke linjer.
 */
function signatureFor(id: SenderId, lucasPhone: string, charliePhone: string): string {
  // 2026-07-16: begge signerer nu som Kinly (Lucas + Charlies fælles firma).
  // HTML-versionen (senders.ts) viser logoet; text-versionen denne brand-linje.
  if (id === "lucas") {
    const lines = ["Lucas Buur", lucasPhone, "Kinly"].map((s) => s.trim()).filter((s) => s.length > 0);
    return `Med venlig hilsen\n${lines.join("\n")}`;
  }
  // Charlie: name + role ("Senior Funding Manager & Web-design entusiast") + phone.
  const role = ["Senior Funding Manager", "Web-design entusiast"].map((s) => s.trim()).filter((s) => s.length > 0).join(" & ");
  const lines = ["Charlie Nielsen", role, charliePhone, "Kinly"].map((s) => s.trim()).filter((s) => s.length > 0);
  return `Med venlig hilsen\n${lines.join("\n")}`;
}

/** Re-sign a body for the chosen sender — preview only, no DB write. */
export function previewSignature(
  body: string,
  sender: SenderId,
  lucasPhone: string = "",
  charliePhone: string = "",
): string {
  return `${stripSignature(body)}\n\n${signatureFor(sender, lucasPhone, charliePhone)}`;
}
