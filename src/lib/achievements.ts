// achievements.ts — detect real, brag-worthy achievements (awards, titles,
// championships) in a business's own text, for the tone-mixer "Tillykke" opener
// (OUTREACH_ANALYSIS #1: RR Studio replied in 17h to a congratulations frame).
//
// Conservative on purpose: a false positive ("vi vinder altid kundernes hjerter")
// would make Lucas look like a mail-merge. We require a concrete award/title
// phrase, a minimum length, and we reject generic review/marketing language.

const AWARD = /(danmarksmester|verdensmester|nordisk mester|europamester|kåret (?:som|til|af)|prisvinder|vinder af|finalist(?: i| til)?|guldmedalje|sølvmedalje|bronzemedalje|årets [a-zæøå]+|tv2[\s-]?prisen|bt[\s-]?prisen|trustpilot[\s-]?guld|excellence award|award winner|certificeret mester|mester i [a-zæøå]+)/i;

const REJECT = /(anmeldelser|reviews?|stjerner|vi vinder altid|vinder hjerter|altid en vinder|kundernes? favorit|bedst til priser)/i;

export interface AchievementHit {
  text: string;   // the matched phrase, trimmed to a clean clause
  source: string; // where it was found (for the report)
}

// Pull achievement phrases from a blob of text (reviews, "om os", etc.).
export function detectAchievements(text: string, source = "tekst"): AchievementHit[] {
  if (!text) return [];
  const hits: AchievementHit[] = [];
  const seen = new Set<string>();

  // Look sentence by sentence so we can return a tidy clause, not a wall.
  for (const raw of text.split(/(?<=[.!?\n])/)) {
    const sentence = raw.trim();
    if (sentence.length < 15) continue;
    if (REJECT.test(sentence)) continue;
    const m = sentence.match(AWARD);
    if (!m) continue;
    // Trim to a short, quotable clause around the match.
    let clause = sentence.replace(/^[^A-Za-zÆØÅæøå0-9]+/, "").replace(/\s+/g, " ").trim();
    if (clause.length > 90) {
      // keep the part containing the award phrase
      const idx = clause.toLowerCase().indexOf(m[0].toLowerCase());
      const start = Math.max(0, idx - 10);
      clause = clause.slice(start, start + 90).trim();
    }
    const key = clause.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ text: clause, source });
  }
  return hits;
}

// Convenience: just the strings, deduped, for MixLead.achievements.
export function achievementStrings(...blobs: Array<{ text: string; source: string }>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const b of blobs) {
    for (const h of detectAchievements(b.text, b.source)) {
      if (!seen.has(h.text.toLowerCase())) {
        seen.add(h.text.toLowerCase());
        out.push(h.text);
      }
    }
  }
  return out;
}
