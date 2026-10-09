// rejections.ts — klassificering af svar på kold mail (flyttet fra sync-rejections-ruten
// så den kan testes). Eksplicit opt-out ⇒ emailStatus "afmeldt", så adressen er
// suppressed på ALLE send-veje, også preview-send (Opus/Astra S2#2, 9/10).

// Phrases indicating the recipient does NOT want further contact
const OPT_OUT_PATTERNS = [
  /ikke kontakt/i,
  /stop med at sende/i,
  /fjern mig/i,
  /afmeld/i,
  /unsubscribe/i,
  /ikke skrive til/i,
  /ikke kontakte mig/i,
  /ikke kontakte os/i,
  /lad være/i,
  /ønsker ikke/i,
];

const REJECTION_PATTERNS = [
  ...OPT_OUT_PATTERNS,
  // Polite "no"
  /\bnej tak\b/i,
  /tak men nej/i,
  /tak men ellers/i,
  /ellers tak/i,
  /ikke interesseret/i,
  /ingen interesse/i,
  /har ingen interess/i,           // "interesse" partial match
  /det har ingen interesse/i,
  /\bikke aktuelt\b/i,
  /ikke er aktuelt/i,
  /tak for tilbudet/i,
  /vi har allerede/i,
  /vi er glade for/i,
  /tilfreds med vores/i,
  /ny hjemmeside lige nu/i,
  /lige nu/i,                       // mild — often paired with "no" but check context
];

// Phrases indicating ACCEPTING/asking for more — should NOT skip these
const ACCEPT_PATTERNS = [
  /\bring til mig\b/i,
  /\bvelkommen til at ringe\b/i,
  /\bhvad er prisen\b/i,
  /\bgerne se\b/i,
  /\bgerne høre mere\b/i,
  /vil gerne tage et kig/i,
  /lyder spændende/i,
  /lad os tage en snak/i,
  /book et møde/i,
  /møde med/i,
  /\bja tak\b/i,
];

export function isRejection(body: string): boolean {
  // Don't classify as rejection if it's clearly accepting
  for (const p of ACCEPT_PATTERNS) if (p.test(body)) return false;
  for (const p of REJECTION_PATTERNS) if (p.test(body)) return true;
  return false;
}

/** Afvisning der udtrykkeligt beder om ikke at blive kontaktet igen (ikke bare "nej tak"). */
export function isOptOut(body: string): boolean {
  return isRejection(body) && OPT_OUT_PATTERNS.some((p) => p.test(body));
}
