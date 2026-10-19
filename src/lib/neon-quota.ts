// Neon-kvoteværn (19/10: free-kvoten på 100 CU-timer løb tør, og HQ stod med
// "Noget gik galt"). Læser forbruget fra Neons API — vækker ikke databasen.
// /api/cron/neon-quota kalder den og logger ok:false fra 70 %, så det ses i
// /api/cron/health (KV-baseret, virker også når DB er nede) og af Hermes.

export const CU_HOURS_LIMIT = 100; // Neon free_v3: 100 CU-timer pr. projekt pr. md. På Launch = prisværn.
export const WARN_AT = 0.7;

export interface NeonProject {
  compute_time_seconds?: number;
  consumption_period_end?: string;
}

export function quotaStatus(p: NeonProject): { ok: boolean; pct: number; note: string } {
  const cuHours = (p.compute_time_seconds ?? 0) / 3600;
  const pct = Math.round((cuHours / CU_HOURS_LIMIT) * 100);
  const reset = p.consumption_period_end ? p.consumption_period_end.slice(0, 10) : "ukendt";
  const note = `Neon ${pct} % (${cuHours.toFixed(1)}/${CU_HOURS_LIMIT} CU-t), nulstilles ${reset}`;
  return { ok: pct < WARN_AT * 100, pct, note };
}

export async function fetchNeonProject(fetcher: typeof fetch = fetch): Promise<NeonProject> {
  const key = process.env.NEON_API_KEY;
  const id = process.env.NEON_PROJECT_ID;
  if (!key || !id) throw new Error("NEON_API_KEY eller NEON_PROJECT_ID mangler i Vercel-env");
  const res = await fetcher(`https://console.neon.tech/api/v2/projects/${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${key}`, accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Neon API svarede ${res.status}`);
  const body = (await res.json()) as { project?: NeonProject };
  if (!body.project) throw new Error("Neon API: intet project i svaret");
  return body.project;
}
