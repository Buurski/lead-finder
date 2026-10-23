// Kilden på en henvendelse (23/10, før K1): hvor kom den fra? kinly.dk sender UTM fra
// landings-URL'en (+ blog-ref / seo-tjek); Meta-leads importeres fra Leads Center-CSV
// med annoncenavnet. Én struktur, så forsiden, CRM-tidslinjen og opgaven viser det samme.

export interface LeadUtm { source: string; medium?: string; campaign?: string; content?: string }
export interface MetaLeadRef { leadId?: string; adName?: string; adsetName?: string; campaignName?: string; formName?: string; createdTime?: string }
export interface LeadSource { utm?: LeadUtm; ref?: string; form?: string; meta?: MetaLeadRef }

const TOKEN = /^[a-z0-9._-]{1,60}$/i;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\r\n]+/g, " ").trim().slice(0, max) : "");
const tok = (v: unknown) => (TOKEN.test(str(v, 60)) ? str(v, 60) : undefined);
const def = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v)) as T;

/** Kun kendte felter i kendt form slipper igennem (offentlig formular bag delt hemmelighed). */
export function cleanLeadSource(v: unknown): LeadSource | undefined {
  if (!v || typeof v !== "object") return undefined;
  const r = v as Record<string, unknown>;
  const u = (r.utm && typeof r.utm === "object" ? r.utm : {}) as Record<string, unknown>;
  const m = (r.meta && typeof r.meta === "object" ? r.meta : {}) as Record<string, unknown>;
  const utmSource = tok(u.source);
  const out: LeadSource = def({
    utm: utmSource ? def({ source: utmSource, medium: tok(u.medium), campaign: tok(u.campaign), content: tok(u.content) }) : undefined,
    ref: /^blog-[a-z0-9-]{1,80}$/.test(str(r.ref, 90)) ? str(r.ref, 90) : undefined,
    form: tok(r.form),
    meta: undefined as MetaLeadRef | undefined,
  });
  const meta = def({
    leadId: str(m.leadId, 40) || undefined,
    adName: str(m.adName, 120) || undefined,
    adsetName: str(m.adsetName, 120) || undefined,
    campaignName: str(m.campaignName, 120) || undefined,
    formName: str(m.formName, 120) || undefined,
    createdTime: str(m.createdTime, 40) || undefined,
  });
  if (Object.keys(meta).length) out.meta = meta;
  return Object.keys(out).length ? out : undefined;
}

/** Én kort linje: "meta / paid / kin-k1 / K1-A-gpt1", "Meta-formular · K1-A-gpt1", "blog-x" eller "seo-tjek". */
export function sourceLabel(s: LeadSource | undefined): string {
  if (!s) return "";
  if (s.meta) return ["Meta-formular", s.meta.adName || s.meta.campaignName || s.meta.formName].filter(Boolean).join(" · ");
  if (s.utm) return [s.utm.source, s.utm.medium, s.utm.campaign, s.utm.content].filter(Boolean).join(" / ");
  return s.ref || s.form || "";
}
