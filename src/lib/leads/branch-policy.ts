// branch-policy.ts — hard branch exclusions. Businesses Lucas does NOT want
// contacted, regardless of fitScore/score. Decided 2026-06-13: drop ALL
// medical/health (dentists, doctors, chiropractors, physiotherapists, psychologists).
//
// IMPORTANT: beauty & skin clinics (skønhedsklinik, hudklinik, kosmetolog) are the
// WARMEST segment (VIDA-type) and are explicitly KEPT — the regex must never match
// them. That's why we anchor on the medical words themselves (tandlæge/læge/…), not
// on the generic "klinik".
//
// Pure + strip-safe so the node engine + scheduled tooling can import it.

// Folds danish chars so "tandlæge"/"tandlaege"/"LÆGE" all match.
function fold(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa");
}

// Medical / health practices Lucas excludes. Matched on the folded branch + name.
// - tandlaege / tandklinik / dentist  → dentists
// - laege / laegehus / laegeklinik / laegecenter / laegehus  → doctors
// - kiropraktor, fysioterap(eut), psykolog, psykiater, sygeplej(erske)
// "laege" is bounded so it can't fire inside unrelated words (none in our branches
// fold to contain "laege" by accident — pleje/negle/salon are all safe).
const EXCLUDED = /(tandlaege|tandklinik|tandpleje|dentist|\blaege\b|laegehus|laegeklinik|laegecenter|laegehuset|laegerne|kiropraktor|fysioterap|psykolog|psykiater|sygeplej)/;

export function isExcludedBranch(branch?: string, name?: string): boolean {
  const hay = `${fold(branch || "")} ${fold(name || "")}`;
  return EXCLUDED.test(hay);
}
