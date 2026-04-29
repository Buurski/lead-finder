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
}

function buildHtml(body: string, trackingPixelUrl: string): string {
  return `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; font-size: 15px; color: #222; line-height: 1.6; max-width: 520px;">
${body}
<br><br>
<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" />
</body></html>`;
}

const TEMPLATES: Record<string, Record<"cold" | "followup", (v: TemplateVars) => EmailTemplate>> = {
  craft: {
    cold: (v) => ({
      subject: `Gratis hjemmeside til ${v.name}?`,
      text: `Hej ${v.name},\n\nMit navn er Lucas, og jeg arbejder som webdesigner med fokus på lokale ${v.branch}-firmaer i ${v.city}-området.\n\nJeg har lavet en gratis demo-hjemmeside specielt til dig — du kan se den uden at binde dig til noget som helst.\n\nSynes du det lyder interessant, så svar bare på denne mail.\n\nVenlig hilsen\nLucas`,
      html: buildHtml(`
<p>Hej ${v.name},</p>
<p>Mit navn er Lucas, og jeg arbejder som webdesigner med fokus på lokale <strong>${v.branch}</strong>-firmaer i ${v.city}-området.</p>
<p>Jeg har lavet en gratis demo-hjemmeside specielt til dig — du kan se den uden at binde dig til noget som helst.</p>
<p>Synes du det lyder interessant, så svar bare på denne mail.</p>
<p>Venlig hilsen<br>Lucas</p>`, v.trackingPixelUrl),
    }),
    followup: (v) => ({
      subject: `Re: Gratis hjemmeside til ${v.name}`,
      text: `Hej igen ${v.name},\n\nJeg vil bare følge op på min mail fra forrige uge om den gratis demo-hjemmeside til ${v.branch}-firmaer i ${v.city}.\n\nDen er stadig klar — helt uforpligtende. Svar gerne hvis du er nysgerrig.\n\nVenlig hilsen\nLucas`,
      html: buildHtml(`
<p>Hej igen ${v.name},</p>
<p>Jeg vil bare følge op på min mail fra forrige uge om den gratis demo-hjemmeside til <strong>${v.branch}</strong>-firmaer i ${v.city}.</p>
<p>Den er stadig klar — helt uforpligtende. Svar gerne hvis du er nysgerrig.</p>
<p>Venlig hilsen<br>Lucas</p>`, v.trackingPixelUrl),
    }),
  },

  service: {
    cold: (v) => ({
      subject: `Gratis hjemmeside til ${v.name}?`,
      text: `Hej ${v.name},\n\nJeg hedder Lucas og er webdesigner. Jeg har lavet en gratis demo-hjemmeside til ${v.branch}-virksomheder i ${v.city} — du kan se den uden at forpligte dig til noget.\n\nInteresseret? Svar på denne mail.\n\nVenlig hilsen\nLucas`,
      html: buildHtml(`
<p>Hej ${v.name},</p>
<p>Jeg hedder Lucas og er webdesigner. Jeg har lavet en gratis demo-hjemmeside til <strong>${v.branch}</strong>-virksomheder i ${v.city} — du kan se den uden at forpligte dig til noget.</p>
<p>Interesseret? Svar på denne mail.</p>
<p>Venlig hilsen<br>Lucas</p>`, v.trackingPixelUrl),
    }),
    followup: (v) => ({
      subject: `Re: Gratis hjemmeside til ${v.name}`,
      text: `Hej igen ${v.name},\n\nBare en hurtig opfølgning — demo-hjemmesiden til din virksomhed i ${v.city} er stadig klar. Gratis og uforpligtende.\n\nVenlig hilsen\nLucas`,
      html: buildHtml(`
<p>Hej igen ${v.name},</p>
<p>Bare en hurtig opfølgning — demo-hjemmesiden til din virksomhed i ${v.city} er stadig klar. Gratis og uforpligtende.</p>
<p>Venlig hilsen<br>Lucas</p>`, v.trackingPixelUrl),
    }),
  },

  professional: {
    cold: (v) => ({
      subject: `Digital tilstedeværelse til ${v.name}`,
      text: `Hej ${v.name},\n\nMit navn er Lucas, og jeg er webdesigner. Jeg har udarbejdet en gratis demo-hjemmeside specifikt til ${v.branch} i ${v.city}-området.\n\nDer er ingen forpligtelse — jeg sender den gerne til dig så du kan se hvad jeg mener.\n\nVenlig hilsen\nLucas`,
      html: buildHtml(`
<p>Hej ${v.name},</p>
<p>Mit navn er Lucas, og jeg er webdesigner. Jeg har udarbejdet en gratis demo-hjemmeside specifikt til <strong>${v.branch}</strong> i ${v.city}-området.</p>
<p>Der er ingen forpligtelse — jeg sender den gerne til dig så du kan se hvad jeg mener.</p>
<p>Venlig hilsen<br>Lucas</p>`, v.trackingPixelUrl),
    }),
    followup: (v) => ({
      subject: `Re: Demo-hjemmeside til ${v.name}`,
      text: `Hej igen ${v.name},\n\nOpfølgning på min mail fra forrige uge. Demo-hjemmesiden er klar og du er stadig velkommen til at se den gratis.\n\nVenlig hilsen\nLucas`,
      html: buildHtml(`
<p>Hej igen ${v.name},</p>
<p>Opfølgning på min mail fra forrige uge. Demo-hjemmesiden er klar og du er stadig velkommen til at se den gratis.</p>
<p>Venlig hilsen<br>Lucas</p>`, v.trackingPixelUrl),
    }),
  },

  food: {
    cold: (v) => ({
      subject: `Gratis hjemmeside til ${v.name}?`,
      text: `Hej ${v.name},\n\nJeg hedder Lucas og laver hjemmesider til lokale spisesteder og kafeer i ${v.city}. Jeg har lavet en gratis demo specielt til jer — I kan se den uden at binde jer til noget.\n\nInteresseret? Skriv endelig!\n\nVenlig hilsen\nLucas`,
      html: buildHtml(`
<p>Hej ${v.name},</p>
<p>Jeg hedder Lucas og laver hjemmesider til lokale <strong>${v.branch}</strong> i ${v.city}. Jeg har lavet en gratis demo specielt til jer — I kan se den uden at binde jer til noget.</p>
<p>Interesseret? Skriv endelig!</p>
<p>Venlig hilsen<br>Lucas</p>`, v.trackingPixelUrl),
    }),
    followup: (v) => ({
      subject: `Re: Gratis hjemmeside til ${v.name}`,
      text: `Hej igen!\n\nFølger lige op på min mail fra sidst om den gratis demo til ${v.name} i ${v.city}. Den er stadig klar hvis I vil se den.\n\nVenlig hilsen\nLucas`,
      html: buildHtml(`
<p>Hej igen!</p>
<p>Følger lige op på min mail fra sidst om den gratis demo til <strong>${v.name}</strong> i ${v.city}. Den er stadig klar hvis I vil se den.</p>
<p>Venlig hilsen<br>Lucas</p>`, v.trackingPixelUrl),
    }),
  },

  beauty: {
    cold: (v) => ({
      subject: `Gratis hjemmeside til ${v.name}?`,
      text: `Hej ${v.name},\n\nJeg hedder Lucas og laver hjemmesider til frisørsaloner i ${v.city}. Jeg har lavet en gratis demo til jer — I kan se den uden at binde jer til noget overhovedet.\n\nSvar bare på mailen hvis I er nysgerrige!\n\nVenlig hilsen\nLucas`,
      html: buildHtml(`
<p>Hej ${v.name},</p>
<p>Jeg hedder Lucas og laver hjemmesider til frisørsaloner i ${v.city}. Jeg har lavet en gratis demo til jer — I kan se den uden at binde jer til noget overhovedet.</p>
<p>Svar bare på mailen hvis I er nysgerrige!</p>
<p>Venlig hilsen<br>Lucas</p>`, v.trackingPixelUrl),
    }),
    followup: (v) => ({
      subject: `Re: Gratis hjemmeside til ${v.name}`,
      text: `Hej igen ${v.name}!\n\nFølger op på min mail om den gratis demo-hjemmeside. Den venter stadig på jer hvis I vil se den.\n\nVenlig hilsen\nLucas`,
      html: buildHtml(`
<p>Hej igen ${v.name}!</p>
<p>Følger op på min mail om den gratis demo-hjemmeside. Den venter stadig på jer hvis I vil se den.</p>
<p>Venlig hilsen<br>Lucas</p>`, v.trackingPixelUrl),
    }),
  },
};

export function buildTrackingPixelUrl(leadId: string): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}/api/email/track/open/${leadId}`;
}

export function buildTrackedClickUrl(leadId: string, destination: string): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}/api/email/track/click/${leadId}?url=${encodeURIComponent(destination)}`;
}

export function getEmailTemplate(
  branch: string,
  type: "cold" | "followup",
  vars: Omit<TemplateVars, "trackingPixelUrl" | "trackedReplyUrl"> & { leadId: string }
): EmailTemplate {
  const group = getBranchGroup(branch);
  const template = TEMPLATES[group]?.[type] ?? TEMPLATES.craft[type];
  const trackingPixelUrl = buildTrackingPixelUrl(vars.leadId);
  return template({ ...vars, trackingPixelUrl });
}

export async function sendLeadEmail(
  lead: { id: string; name: string; branch: string; city: string; email: string },
  type: "cold" | "followup"
): Promise<void> {
  const template = getEmailTemplate(lead.branch, type, {
    leadId: lead.id,
    name: lead.name,
    branch: lead.branch,
    city: lead.city,
  });
  await transporter.sendMail({
    from: `Lucas <${process.env.GMAIL_USER}>`,
    to: lead.email,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });
}

export function previewEmailTemplate(
  lead: { id: string; name: string; branch: string; city: string },
  type: "cold" | "followup"
): EmailTemplate {
  return getEmailTemplate(lead.branch, type, {
    leadId: lead.id,
    name: lead.name,
    branch: lead.branch,
    city: lead.city,
  });
}
