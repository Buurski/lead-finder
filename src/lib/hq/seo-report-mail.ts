// Rapport-mailen til en der selv har bedt om hele SEO-analysen på kinly.dk.
// Altid en KLADDE: den sendes kun når Lucas/Charlie trykker send i /previews
// (samme send-gate, claim og dagsbudget som alle andre gratis udkast).
//
// Opbygning (salgspsykologi, men ærlig): personlig tekst først (et menneske
// skriver), så deres eget tal (ejerskab: "jeres side"), de vigtigste huller
// konkret (specificitet slår adjektiver), ét tilbud med en rigtig frist og ét
// klart næste skridt. Ingen falsk knaphed, ingen opdigtede tal.
//
// E-mail-HTML: tabeller + inline styles (Gmail/Outlook), systemfonte med
// Georgia som serif-fallback — web-fonte loader ikke pålideligt i mail.

export interface SeoReportInput {
  body: string; // den personlige tekst fra udkastet (uden hilsen/signatur)
  seoTjek: { host: string; score: number; mangler: string[] };
  signatureHtml: string;
  signatureText: string;
  now?: Date;
}

// Tilbuddet er en forretningsbeslutning: ændres her ét sted. Fristen regnes fra afsendelsen.
export const SEO_REPORT_OFFER = {
  headline: "10 % på den første opgave",
  text: "Siger I ja inden fristen, trækker vi 10 % fra den faste pris på jeres første opgave hos os, fx at rette punkterne ovenfor. I får prisen skriftligt, før I beslutter noget, og der er ingen binding.",
  days: 14,
} as const;

const C = { paper: "#faf6ef", surface: "#f3ede2", ink: "#191713", mid: "#55504a", faded: "#8a847b", ember: "#d4500f", emberDeep: "#a63b05", rule: "#e4dccd", emberLight: "#f08a55" };
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "-apple-system,'Segoe UI',Roboto,Arial,sans-serif";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function scoreLabel(score: number): string {
  if (score >= 80) return "Godt fundament";
  if (score >= 55) return "Tæt på, men med huller";
  return "Kunder har svært ved at finde jer";
}

export function offerDeadline(now = new Date()): string {
  const d = new Date(now.getTime() + SEO_REPORT_OFFER.days * 86_400_000);
  return d.toLocaleDateString("da-DK", { day: "numeric", month: "long", timeZone: "Europe/Copenhagen" });
}

function paragraphs(text: string): string {
  return esc(text.trim())
    .replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:${C.emberDeep};">${u}</a>`)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px 0;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

export function renderSeoReportHtml(i: SeoReportInput): string {
  const { host, score, mangler } = i.seoTjek;
  const pct = Math.max(2, Math.min(100, Math.round(score)));
  const top = mangler.slice(0, 5);
  const deadline = offerDeadline(i.now);
  const items = top
    .map(
      (m, n) => `<tr><td valign="top" style="padding:6px 12px 6px 0;font-family:${SANS};font-size:12px;font-weight:700;color:${C.emberDeep};">${String(n + 1).padStart(2, "0")}</td><td style="padding:6px 0;font-family:${SANS};font-size:15px;line-height:1.5;color:${C.ink};">${esc(m)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>SEO-analyse af ${esc(host)}</title></head>
<body bgcolor="${C.paper}" style="margin:0;padding:0;background:${C.paper};">
<span style="display:none;max-height:0;overflow:hidden;">${esc(host)} fik ${score}/100 — her er det vigtigste at rette.${"&#847;&zwnj;&nbsp;".repeat(60)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.paper}" style="background:${C.paper};"><tr><td align="center" style="padding:28px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
<tr><td style="padding:0 4px 18px 4px;font-family:${SERIF};font-size:22px;color:${C.ink};letter-spacing:-0.3px;">Kinly</td></tr>
<tr><td style="font-family:${SANS};font-size:15px;line-height:1.6;color:${C.ink};padding:0 4px 8px 4px;">
${paragraphs(i.body)}
</td></tr>
<tr><td style="padding:10px 0 0 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background:#ffffff;border:1px solid ${C.rule};border-radius:12px;">
<tr><td style="padding:24px 24px 8px 24px;font-family:${SANS};font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:${C.mid};">Jeres resultat · ${esc(host)}</td></tr>
<tr><td style="padding:0 24px;"><span style="font-family:${SERIF};font-size:48px;line-height:1;color:${C.ink};">${score}</span><span style="font-family:${SANS};font-size:16px;color:${C.mid};"> / 100</span>
<div style="font-family:${SANS};font-size:15px;color:${C.mid};padding-top:6px;">${scoreLabel(score)}</div></td></tr>
<tr><td style="padding:16px 24px 4px 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.surface}" style="background:${C.surface};border-radius:4px;"><tr><td width="${pct}%" bgcolor="${C.ember}" style="background:${C.ember};height:8px;font-size:0;line-height:0;border-radius:4px;">&nbsp;</td><td style="font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>
${top.length ? `<tr><td style="padding:22px 24px 4px 24px;font-family:${SERIF};font-size:19px;color:${C.ink};">Det vigtigste at rette først</td></tr>
<tr><td style="padding:4px 24px 20px 24px;"><table role="presentation" cellpadding="0" cellspacing="0">${items}</table></td></tr>` : ""}
</table></td></tr>
<tr><td style="padding:16px 0 0 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.ink}" style="background:${C.ink};border-radius:12px;">
<tr><td style="padding:24px 24px 6px 24px;font-family:${SANS};font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:${C.emberLight};">Gælder til ${deadline}</td></tr>
<tr><td style="padding:0 24px;font-family:${SERIF};font-size:24px;line-height:1.2;color:${C.paper};">${esc(SEO_REPORT_OFFER.headline)}</td></tr>
<tr><td style="padding:10px 24px 18px 24px;font-family:${SANS};font-size:15px;line-height:1.6;color:#d9d2c5;">${esc(SEO_REPORT_OFFER.text)}</td></tr>
<tr><td style="padding:0 24px 26px 24px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="${C.emberDeep}" style="background:${C.emberDeep};border-radius:8px;"><a href="https://kinly.dk/kontakt/?ref=seo-rapport" style="display:inline-block;padding:13px 22px;font-family:${SANS};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Book 15 minutter om planen</a></td></tr></table>
<div style="font-family:${SANS};font-size:13px;color:#b9b1a3;padding-top:12px;">Eller svar bare på denne mail.</div></td></tr>
</table></td></tr>
<tr><td style="padding:22px 4px 0 4px;font-family:${SANS};font-size:14px;line-height:1.55;color:${C.ink};">
<p style="margin:0 0 10px 0;">Med venlig hilsen</p>
${i.signatureHtml}
</td></tr>
<tr><td style="padding:22px 4px 0 4px;font-family:${SANS};font-size:13px;line-height:1.5;color:${C.mid};">Du får denne mail, fordi du bad om hele analysen af ${esc(host)} på kinly.dk.</td></tr>
</table></td></tr></table></body></html>`;
}

export function renderSeoReportText(i: SeoReportInput): string {
  const { host, score, mangler } = i.seoTjek;
  const top = mangler.slice(0, 5).map((m, n) => `${n + 1}. ${m}`).join("\n");
  return [
    i.body.trim(),
    `— Jeres resultat for ${host}: ${score}/100 (${scoreLabel(score)})`,
    top ? `Det vigtigste at rette først:\n${top}` : "",
    `${SEO_REPORT_OFFER.headline} (gælder til ${offerDeadline(i.now)}): ${SEO_REPORT_OFFER.text}`,
    "Book 15 minutter: https://kinly.dk/kontakt/?ref=seo-rapport — eller svar på denne mail.",
    `Med venlig hilsen\n${i.signatureText}`,
    `Du får denne mail, fordi du bad om hele analysen af ${host} på kinly.dk.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
