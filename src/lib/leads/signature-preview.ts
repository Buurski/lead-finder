// signature-preview.ts — client-safe sign-off preview.
//
// Mirrors the formatting in src/lib/senders.ts so the /godkendelse preview
// matches what the send route actually emits. Kept separate because page.tsx
// is "use client" and senders.ts pulls in nodemailer (Node-only). Phone
// numbers are passed in (not read from process.env) so the bundle stays
// free of server-only code.

export type SenderId = "lucas" | "charlie";

const SIGNATURE_PATTERNS: RegExp[] = [
  /\n+Med venlig hilsen,?\s*\n+(?:Lucas|Charlie)(?:\s+(?:Buur|Nielsen))?(?:\n\+?[\d\s]{6,})?\s*$/i,
  /\n+Mvh,?\s*(?:Lucas|Charlie)(?:\n\+?[\d\s]{6,})?\s*$/i,
  /\n+(?:Lucas|Charlie)(?:\s+(?:Buur|Nielsen))?\n\+?[\d\s]{6,}\s*$/i,
  /\n+(?:Lucas|Charlie)(?:\s+(?:Buur|Nielsen))?\s*$/i,
];

function stripSignature(body: string): string {
  let t = (body || "").replace(/\s+$/, "");
  for (const re of SIGNATURE_PATTERNS) {
    if (re.test(t)) { t = t.replace(re, "").replace(/\s+$/, ""); break; }
  }
  return t;
}

/**
 * Render the signature block for the given sender.
 *  - Lucas: navn + telefon (hans eksisterende layout — bevarer diff)
 *  - Charlie: navn + titel + tagline + telefon
 * Tomme felter filtres væk så vi aldrig emitterer blanke linjer.
 */
function signatureFor(id: SenderId, lucasPhone: string, charliePhone: string): string {
  if (id === "lucas") {
    const lines = ["Lucas Buur", lucasPhone].map((s) => s.trim()).filter((s) => s.length > 0);
    return `Med venlig hilsen\n${lines.join("\n")}`;
  }
  // Charlie: name + title + tagline + phone, alle tomme felter fra.
  const lines = [
    "Charlie Nielsen",
    "Senior Funding Manager",
    "Web-design entusiast",
    charliePhone,
  ].map((s) => s.trim()).filter((s) => s.length > 0);
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