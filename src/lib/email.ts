import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const BRANCH_GROUP_MAP: Record<string, string> = {
  tømrer: "craft", maler: "craft", elektriker: "craft",
  "vvs-installatør": "craft", blikkenslager: "craft",
  tagdækker: "craft", murermester: "craft",
  rengøringsvirksomhed: "service", vinduespudser: "service", anlægsgartner: "service",
  advokat: "professional", revisor: "professional",
  fysioterapeut: "professional", tandlæge: "professional", optiker: "professional",
  restaurant: "food", café: "food", fotograf: "professional",
  frisørsalon: "beauty",
};

function getBranchGroup(branch: string): string {
  const normalized = branch.toLowerCase().trim();
  for (const [key, group] of Object.entries(BRANCH_GROUP_MAP)) {
    if (normalized.includes(key)) return group;
  }
  return "craft";
}

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

interface TemplateVars {
  name: string;
  branch: string;
  city: string;
  trackingPixelUrl: string;
  websiteStatus: string;      // "none" | "dead" | "old" | "ok"
  websiteQualityTier: string; // "modern" | "mediocre" | "old" | "dead" | ""
}

function buildHtml(body: string, trackingPixelUrl: string): string {
  return `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; font-size: 15px; color: #222; line-height: 1.6; max-width: 520px;">
${body}
<br><br>
<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" />
</body></html>`;
}

function websiteLine(v: TemplateVars): string {
  if (v.websiteStatus === "none")
    return "Jeg kan se I ikke har en hjemmeside endnu — det kunne gøre en stor forskel for at tiltrække nye kunder.";
  if (v.websiteQualityTier === "dead" || v.websiteStatus === "dead")
    return "Jeg har kigget på jeres hjemmeside, og den ser ud til at have tekniske problemer — det koster jer sikkert kunder uden I ved det.";
  if (v.websiteQualityTier === "old" || v.websiteStatus === "old")
    return "Jeg har kigget på jeres hjemmeside, og synes en virksomhed som jer fortjener noget der tiltrækker flere kunder — den nuværende er ikke helt med i dag.";
  if (v.websiteQualityTier === "mediocre")
    return "Jeg har kigget på jeres hjemmeside, og synes en virksomhed som jer godt kunne have noget der giver et bedre førstehåndsindtryk overfor kunderne.";
  return "Jeg har kigget på jeres hjemmeside, og synes en virksomhed som jer fortjener noget der virkelig tiltrækker kunder.";
}

const TEMPLATES: Record<string, Record<"cold" | "followup", (v: TemplateVars) => EmailTemplate>> = {
  craft: {
    cold: (v) => {
      const ws = websiteLine(v);
      return {
        subject: `Gratis hjemmeside til ${v.name}?`,
        text: `Hej ${v.name},\n\nJeg hedder Lucas, er salgselev fra Ikast, og laver i min fritid hjemmesider til lokale ${v.branch}-firmaer i området.\n\n${ws}\n\nJeg har lavet en gratis demo specielt til jer — helt uforpligtende.\n\nSvar gerne på mailen, eller ring/skriv til mig på +45 23 24 24 82 — helt uforpligtende.\n\nVenlig hilsen\nLucas Buur\nTlf. +45 23 24 24 82`,
        html: buildHtml(`
<p>Hej ${v.name},</p>
<p>Jeg hedder Lucas, er salgselev fra Ikast, og laver i min fritid hjemmesider til lokale <strong>${v.branch}</strong>-firmaer i området.</p>
<p>${ws}</p>
<p>Jeg har lavet en gratis demo specielt til jer — helt uforpligtende.</p>
<p>Svar gerne på mailen, eller ring/skriv til mig på <strong>+45 23 24 24 82</strong> — det er helt uforpligtende.</p>
<p>Venlig hilsen<br>Lucas Buur<br>Tlf. +45 23 24 24 82</p>`, v.trackingPixelUrl),
      };
    },
    followup: (v) => ({
      subject: `Re: Gratis hjemmeside til ${v.name}`,
      text: `Hej igen ${v.name},\n\nFølger lige op på min mail fra forrige uge om demo-hjemmesiden til ${v.branch}-firmaer i området.\n\nDen er stadig klar — svar på mailen eller ring/skriv til mig på +45 23 24 24 82.\n\nVenlig hilsen\nLucas Buur\nTlf. +45 23 24 24 82`,
      html: buildHtml(`
<p>Hej igen ${v.name},</p>
<p>Følger lige op på min mail fra forrige uge om demo-hjemmesiden til <strong>${v.branch}</strong>-firmaer i området.</p>
<p>Den er stadig klar — svar på mailen eller ring/skriv til mig på <strong>+45 23 24 24 82</strong>.</p>
<p>Venlig hilsen<br>Lucas Buur<br>Tlf. +45 23 24 24 82</p>`, v.trackingPixelUrl),
    }),
  },

  service: {
    cold: (v) => {
      const ws = websiteLine(v);
      return {
        subject: `Gratis hjemmeside til ${v.name}?`,
        text: `Hej ${v.name},\n\nJeg hedder Lucas, er salgselev fra Ikast, og laver i min fritid hjemmesider til lokale virksomheder i ${v.city}.\n\n${ws}\n\nJeg har lavet en gratis demo specielt til ${v.name} — helt uforpligtende.\n\nSvar gerne på mailen, eller kontakt mig direkte på +45 23 24 24 82 — det er helt uforpligtende.\n\nVenlig hilsen\nLucas Buur\nTlf. +45 23 24 24 82`,
        html: buildHtml(`
<p>Hej ${v.name},</p>
<p>Jeg hedder Lucas, er salgselev fra Ikast, og laver i min fritid hjemmesider til lokale virksomheder i ${v.city}.</p>
<p>${ws}</p>
<p>Jeg har lavet en gratis demo specielt til ${v.name} — helt uforpligtende.</p>
<p>Svar gerne på mailen, eller kontakt mig direkte på <strong>+45 23 24 24 82</strong> — det er helt uforpligtende.</p>
<p>Venlig hilsen<br>Lucas Buur<br>Tlf. +45 23 24 24 82</p>`, v.trackingPixelUrl),
      };
    },
    followup: (v) => ({
      subject: `Re: Gratis hjemmeside til ${v.name}`,
      text: `Hej igen ${v.name},\n\nBare en hurtig opfølgning — demo-hjemmesiden til ${v.name} venter stadig.\n\nGratis og uforpligtende — svar på mailen eller ring/skriv til mig på +45 23 24 24 82.\n\nVenlig hilsen\nLucas Buur\nTlf. +45 23 24 24 82`,
      html: buildHtml(`
<p>Hej igen ${v.name},</p>
<p>Bare en hurtig opfølgning — demo-hjemmesiden til ${v.name} venter stadig.</p>
<p>Gratis og uforpligtende — svar på mailen eller ring/skriv til mig på <strong>+45 23 24 24 82</strong>.</p>
<p>Venlig hilsen<br>Lucas Buur<br>Tlf. +45 23 24 24 82</p>`, v.trackingPixelUrl),
    }),
  },

  professional: {
    cold: (v) => {
      const ws = websiteLine(v);
      return {
        subject: `Gratis hjemmeside til ${v.name}?`,
        text: `Hej ${v.name},\n\nJeg hedder Lucas, er salgselev fra Ikast, og laver i min fritid hjemmesider til lokale ${v.branch} i ${v.city}-området.\n\n${ws}\n\nJeg har lavet en gratis demo specielt til jer — I kan se den uden at forpligte jer til noget.\n\nSvar gerne på mailen, eller kontakt mig på +45 23 24 24 82 — I forpligter jer ikke til noget.\n\nVenlig hilsen\nLucas Buur\nTlf. +45 23 24 24 82`,
        html: buildHtml(`
<p>Hej ${v.name},</p>
<p>Jeg hedder Lucas, er salgselev fra Ikast, og laver i min fritid hjemmesider til lokale <strong>${v.branch}</strong> i ${v.city}-området.</p>
<p>${ws}</p>
<p>Jeg har lavet en gratis demo specielt til jer — I kan se den uden at forpligte jer til noget.</p>
<p>Svar gerne på mailen, eller kontakt mig på <strong>+45 23 24 24 82</strong> — I forpligter jer ikke til noget.</p>
<p>Venlig hilsen<br>Lucas Buur<br>Tlf. +45 23 24 24 82</p>`, v.trackingPixelUrl),
      };
    },
    followup: (v) => ({
      subject: `Re: Demo-hjemmeside til ${v.name}`,
      text: `Hej igen ${v.name},\n\nOpfølgning på min mail fra forrige uge om demo-hjemmesiden.\n\nDen er stadig klar — svar på mailen eller giv mig et ring/besked på +45 23 24 24 82.\n\nVenlig hilsen\nLucas Buur\nTlf. +45 23 24 24 82`,
      html: buildHtml(`
<p>Hej igen ${v.name},</p>
<p>Opfølgning på min mail fra forrige uge om demo-hjemmesiden.</p>
<p>Den er stadig klar — svar på mailen eller giv mig et ring/besked på <strong>+45 23 24 24 82</strong>.</p>
<p>Venlig hilsen<br>Lucas Buur<br>Tlf. +45 23 24 24 82</p>`, v.trackingPixelUrl),
    }),
  },

  food: {
    cold: (v) => {
      const ws = websiteLine(v);
      return {
        subject: `Gratis hjemmeside til ${v.name}?`,
        text: `Hej ${v.name},\n\nJeg hedder Lucas, er salgselev fra Ikast, og laver i min fritid hjemmesider til lokale ${v.branch} i ${v.city}.\n\n${ws}\n\nJeg har lavet en gratis demo specielt til jer — helt uforpligtende.\n\nSkriv gerne her, eller tag fat i mig på +45 23 24 24 82 — helt uforpligtende!\n\nVenlig hilsen\nLucas Buur\nTlf. +45 23 24 24 82`,
        html: buildHtml(`
<p>Hej ${v.name},</p>
<p>Jeg hedder Lucas, er salgselev fra Ikast, og laver i min fritid hjemmesider til lokale <strong>${v.branch}</strong> i ${v.city}.</p>
<p>${ws}</p>
<p>Jeg har lavet en gratis demo specielt til jer — helt uforpligtende.</p>
<p>Skriv gerne her, eller tag fat i mig på <strong>+45 23 24 24 82</strong> — helt uforpligtende!</p>
<p>Venlig hilsen<br>Lucas Buur<br>Tlf. +45 23 24 24 82</p>`, v.trackingPixelUrl),
      };
    },
    followup: (v) => ({
      subject: `Re: Gratis hjemmeside til ${v.name}`,
      text: `Hej igen!\n\nFølger op på min mail fra sidst om den gratis demo til ${v.name} i ${v.city}.\n\nDen er stadig klar — svar her eller skriv til mig på +45 23 24 24 82.\n\nVenlig hilsen\nLucas Buur\nTlf. +45 23 24 24 82`,
      html: buildHtml(`
<p>Hej igen!</p>
<p>Følger op på min mail fra sidst om den gratis demo til <strong>${v.name}</strong> i ${v.city}.</p>
<p>Den er stadig klar — svar her eller skriv til mig på <strong>+45 23 24 24 82</strong>.</p>
<p>Venlig hilsen<br>Lucas Buur<br>Tlf. +45 23 24 24 82</p>`, v.trackingPixelUrl),
    }),
  },

  beauty: {
    cold: (v) => {
      const ws = websiteLine(v);
      return {
        subject: `Gratis hjemmeside til ${v.name}?`,
        text: `Hej ${v.name},\n\nJeg hedder Lucas, er salgselev fra Ikast, og laver i min fritid hjemmesider til frisørsaloner i ${v.city}.\n\n${ws}\n\nJeg har lavet en gratis demo specielt til jer — helt uforpligtende.\n\nSvar gerne på mailen, eller ring/skriv til mig på +45 23 24 24 82 — helt uforpligtende!\n\nVenlig hilsen\nLucas Buur\nTlf. +45 23 24 24 82`,
        html: buildHtml(`
<p>Hej ${v.name},</p>
<p>Jeg hedder Lucas, er salgselev fra Ikast, og laver i min fritid hjemmesider til frisørsaloner i ${v.city}.</p>
<p>${ws}</p>
<p>Jeg har lavet en gratis demo specielt til jer — helt uforpligtende.</p>
<p>Svar gerne på mailen, eller ring/skriv til mig på <strong>+45 23 24 24 82</strong> — helt uforpligtende!</p>
<p>Venlig hilsen<br>Lucas Buur<br>Tlf. +45 23 24 24 82</p>`, v.trackingPixelUrl),
      };
    },
    followup: (v) => ({
      subject: `Re: Gratis hjemmeside til ${v.name}`,
      text: `Hej igen ${v.name}!\n\nFølger op på min mail om den gratis demo-hjemmeside.\n\nDen venter stadig — svar her eller tag fat i mig på +45 23 24 24 82.\n\nVenlig hilsen\nLucas Buur\nTlf. +45 23 24 24 82`,
      html: buildHtml(`
<p>Hej igen ${v.name}!</p>
<p>Følger op på min mail om den gratis demo-hjemmeside.</p>
<p>Den venter stadig — svar her eller tag fat i mig på <strong>+45 23 24 24 82</strong>.</p>
<p>Venlig hilsen<br>Lucas Buur<br>Tlf. +45 23 24 24 82</p>`, v.trackingPixelUrl),
    }),
  },
};

function getAppUrl(): string {
  if (process.env.APP_URL && !process.env.APP_URL.includes("localhost")) return process.env.APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return process.env.APP_URL ?? "http://localhost:3000";
}

export function buildTrackingPixelUrl(leadId: string): string {
  return `${getAppUrl()}/api/email/track/open/${leadId}`;
}

export function buildTrackedClickUrl(leadId: string, destination: string): string {
  return `${getAppUrl()}/api/email/track/click/${leadId}?url=${encodeURIComponent(destination)}`;
}

export function getEmailTemplate(
  branch: string,
  type: "cold" | "followup",
  vars: Omit<TemplateVars, "trackingPixelUrl"> & { leadId: string }
): EmailTemplate {
  const group = getBranchGroup(branch);
  const template = TEMPLATES[group]?.[type] ?? TEMPLATES.craft[type];
  const trackingPixelUrl = buildTrackingPixelUrl(vars.leadId);
  return template({ ...vars, trackingPixelUrl });
}

export async function sendLeadEmail(
  lead: { id: string; name: string; branch: string; city: string; email: string; websiteStatus: string; websiteQualityTier: string },
  type: "cold" | "followup"
): Promise<void> {
  const template = getEmailTemplate(lead.branch, type, {
    leadId: lead.id,
    name: lead.name,
    branch: lead.branch,
    city: lead.city,
    websiteStatus: lead.websiteStatus,
    websiteQualityTier: lead.websiteQualityTier,
  });
  await transporter.sendMail({
    from: `Lucas Buur <${process.env.GMAIL_USER}>`,
    to: lead.email,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });
}

export function previewEmailTemplate(
  lead: { id: string; name: string; branch: string; city: string; websiteStatus: string; websiteQualityTier: string },
  type: "cold" | "followup"
): EmailTemplate {
  return getEmailTemplate(lead.branch, type, {
    leadId: lead.id,
    name: lead.name,
    branch: lead.branch,
    city: lead.city,
    websiteStatus: lead.websiteStatus,
    websiteQualityTier: lead.websiteQualityTier,
  });
}
