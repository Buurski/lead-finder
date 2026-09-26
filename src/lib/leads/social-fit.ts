// social-fit.ts — pure rules for "website" links that are really a social or
// directory page, and for how a Facebook page's size fits Kinly's target
// group. No imports on purpose: scripts/leadgen/run.mjs loads this under plain
// Node on the VPS, and social-stats.ts (which imports store) must not ride along.

// Base domains; any subdomain counts too (m., web., da-dk., business., mbasic. …).
const SOCIAL_HOSTS: Record<string, "facebook" | "instagram" | "directory"> = {
  "facebook.com": "facebook", "fb.com": "facebook", "fb.me": "facebook",
  "instagram.com": "instagram",
  "krak.dk": "directory", "degulesider.dk": "directory", "linktr.ee": "directory",
};

/** "facebook" | "instagram" | "directory" when the URL is not the business's own site, else null. */
export function socialKind(url: string | null | undefined): "facebook" | "instagram" | "directory" | null {
  if (!url) return null;
  let host: string;
  try { host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase(); }
  catch { return null; }
  const base = Object.keys(SOCIAL_HOSTS).find((d) => host === d || host.endsWith(`.${d}`));
  return base ? SOCIAL_HOSTS[base] : null;
}

// Lucas 2026-09-20/26: "Restaurant Berserk had 12,000 followers — we are not
// interested in those"; 10k+ is too big for us. Calibration knob, not a law.
export const FB_TOO_BIG = 10_000;

/**
 * Score adjustment from a Facebook page — target-group fit, NOT "more is better".
 * Too big for Kinly = -100 (out, whatever the score). Everything else = 0: they don't need a Facebook page
 * (Lucas 26/9), so no bonus either — a +5 for an active page lifted 20 of 70
 * picks in the 26/9 dry run, which quietly punished the leads without one.
 */
export function fbFit(followers: number | null | undefined): number {
  if (followers == null || !Number.isFinite(followers)) return 0;
  return followers > FB_TOO_BIG ? -100 : 0;
}
