// Links bygget af data udefra (formularer, scraping, feeds) må kun blive http(s).
// Alt andet (javascript:, data:, vbscript: …) bliver til et https-link på værtsnavnet
// eller forsvinder — aldrig kode der kører i CRM'ets session.
export function safeHref(raw: string | undefined | null): string | undefined {
  const v = (raw ?? "").trim();
  if (!v) return undefined;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return undefined; // andet skema
  return `https://${v}`;
}
