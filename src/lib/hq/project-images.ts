// Kundekortenes billeder på /kunder: samme billede som kunden har på kinly.dk/projekter/.
// Kilden er kinly.dk's offentlige /projekter.json (navn, domæne, billede). En ny kunde uden
// case falder automatisk tilbage til et skærmbillede af egen side (/api/shot).
import "server-only";

export interface ProjectImage { name: string; host: string; image: string }

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\b(aps|a\/s|ivs|i\/s)\b/g, "").replace(/[^a-z0-9æøå]/g, "");

export async function loadProjectImages(): Promise<ProjectImage[]> {
  try {
    const site = process.env.KINLY_SITE_URL || "https://kinly.dk"; // lokal test: peg på en lokal kinly-site
    const res = await fetch(`${site}/projekter.json`, { next: { revalidate: 86_400 }, signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const { items } = (await res.json()) as { items?: ProjectImage[] };
    return (items ?? []).filter((i) => typeof i?.image === "string" && i.image.startsWith("https://kinly.dk/"));
  } catch {
    return []; // kinly.dk nede/langsom ⇒ skærmbillede-fallback, siden vælter ikke
  }
}

/** Domæne først (sikrest), ellers navn (fx KT VVS kører stadig på en vercel.app-adresse). */
export function projectImageFor(list: ProjectImage[], domain: string | null, name: string): string | null {
  const d = domain?.replace(/^www\./, "");
  const byHost = d ? list.find((p) => p.host === d) : undefined;
  if (byHost) return byHost.image;
  const n = norm(name);
  const byName = n.length >= 4 ? list.find((p) => { const m = norm(p.name); return m === n || m.includes(n) || n.includes(m); }) : undefined;
  return byName?.image ?? null;
}
