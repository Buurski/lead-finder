// Hvilken kanal passer til et lead-svar? Rene regler (spec 2026-10-15-har-svaret-kontekst-design.md §6), ingen AI.
// Princip: de svarede på mail, så mail er standardkanalen; ring kun hvis de selv bad om det.

export type ReplyBucket = "skriv" | "ring" | "tjek" | "gammel" | "luk";

/** Visningsrækkefølge på siden. */
export const BUCKET_ORDER: ReplyBucket[] = ["skriv", "ring", "tjek", "gammel", "luk"];
export const BUCKET_LABEL: Record<ReplyBucket, string> = {
  skriv: "Skriv tilbage",
  ring: "Ring",
  tjek: "Tjek først",
  gammel: "Gammel",
  luk: "Luk",
};

export const OLD_REPLY_DAYS = 60;

export interface BucketInput {
  category: string | null; // lead_reply.category; null = ingen svar-mail hentet
  asksCall: boolean;
  receivedAt: Date | null;
  hasSnippet: boolean;
}

export interface BucketResult {
  bucket: ReplyBucket;
  why: string; // én linje, vises på kortet
}

const WHY_SKRIV: Record<string, string> = {
  question: "De stiller et spørgsmål. Svar på mail.",
  objection: "De tøver. Svar roligt på mail, uden pres.",
  interested: "De virker interesserede. Svar på mail.",
};

/** Første match vinder: luk, ingen mail, gammel, uklar/autosvar, ring, skriv. */
export function bucketFor(i: BucketInput, now: Date = new Date()): BucketResult {
  if (i.category === "not-interested" || i.category === "unsubscribe") {
    return { bucket: "luk", why: "De har sagt nej eller bedt om at blive fjernet. Luk dem." };
  }
  if (!i.receivedAt) return { bucket: "tjek", why: "Ingen svar-mail hentet. Åbn Gmail og læs den." };
  const age = Math.floor((now.getTime() - i.receivedAt.getTime()) / 86_400_000);
  if (age > OLD_REPLY_DAYS) return { bucket: "gammel", why: `Svaret er ${age} dage gammelt. Kun til info.` };
  if (i.category === "auto-reply") return { bucket: "tjek", why: "Automatisk svar, ikke et menneske." };
  if (i.category === "other" || i.category === "wrong-person" || !i.hasSnippet) {
    return { bucket: "tjek", why: "Uklart svar. Læs det i Gmail, før du gør noget." };
  }
  if (i.asksCall) return { bucket: "ring", why: "De bad selv om et opkald." };
  return { bucket: "skriv", why: WHY_SKRIV[i.category ?? ""] ?? "De svarede på mail. Svar på mail." };
}

/** Første danske telefonnummer i teksten (8 cifre, evt. +45), ikke et CVR-nummer. null = intet. */
export function phoneInText(text: string): string | null {
  const noCvr = text.replace(/\bcvr(?:[-\s]*(?:nr|nummer))?\.?:?\s*\d[\d\s]{6,}\d/gi, " ");
  const m = noCvr.match(/(?<!\d)(?:\+45[\s.-]?)?\d{2}(?:[\s.-]?\d{2}){3}(?!\d)/);
  return m ? m[0].trim() : null;
}
