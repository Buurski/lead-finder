// sms/compose.ts — a SHORT, mobile-friendly draft for the SMS channel. SMS is read
// on a phone, so this is tighter than the email/Messenger copy: one warm line, one
// demo link, sign-off. No price/kr, no hard CTA. Pure + strip-safe.

import { pickDemoPair } from "../demos.ts";

export function buildSmsDraft(lead: { name: string; branch?: string; city?: string; reviews?: number }): string {
  const [demo] = pickDemoPair(lead.branch || "", lead.name);
  const reviews = lead.reviews && lead.reviews > 0 ? `jeres ${lead.reviews} flotte anmeldelser` : "jeres sted";
  return `Hej ${lead.name}! Så lige ${reviews} — stærkt. Lagde mærke til I ikke har en rigtig hjemmeside endnu. Jeg laver dem ved siden af min salgselev-plads; her er et eksempel jeg har lavet: ${demo.url} — skriv hvis det kunne være noget :) Mvh Lucas`;
}
