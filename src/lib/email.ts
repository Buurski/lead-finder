import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  pool: true,
  maxConnections: 1,
  maxMessages: Infinity,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const DEMO_URLS = {
  food: [
    "https://under-klippen.vercel.app/",
    "https://zaytoon-six.vercel.app/",
  ],
  craft: "https://vestfjends.vercel.app/",
  photo: "https://buurfoto.vercel.app/",
  professional: "https://midtadvokaterne-dttc.vercel.app/",
} as const;

const BRANCH_GROUP_MAP: Record<string, string> = {
  tømrer: "craft", maler: "craft", elektriker: "craft",
  "vvs-installatør": "craft", blikkenslager: "craft",
  tagdækker: "craft", murermester: "craft",
  rengøringsvirksomhed: "service", vinduespudser: "service", anlægsgartner: "service",
  skønhedsklinik: "service", hudklinik: "service", "negle & vippeextensions salon": "service",
  advokat: "professional", revisor: "professional",
  fysioterapeut: "professional", tandlæge: "professional", optiker: "professional",
  restaurant: "food", café: "food",
  fotograf: "photo",
};

// Human-readable plural branch names for use in email copy
const BRANCH_DISPLAY: Record<string, string> = {
  tømrer: "tømrerfirmaer",
  maler: "malerfirmaer",
  elektriker: "elektrikerfirmaer",
  "vvs-installatør": "VVS-firmaer",
  blikkenslager: "blikkenslagerfirmaer",
  tagdækker: "tagdækkerfirmaer",
  murermester: "murerfirmaer",
  rengøringsvirksomhed: "rengøringsvirksomheder",
  vinduespudser: "vinduespoleringsvirksomheder",
  anlægsgartner: "anlægsgartnere",
  skønhedsklinik: "skønhedsklinikker",
  hudklinik: "hudklinikker",
  "negle & vippeextensions salon": "negle & vippeextensions saloner",
  advokat: "advokatfirmaer",
  revisor: "revisionsfirmaer",
  fysioterapeut: "fysioterapiklinikker",
  tandlæge: "tandlægeklinikker",
  optiker: "optikerforretninger",
  restaurant: "restauranter",
  café: "caféer",
  fotograf: "fotografer",
};

// Fallback for unknown branches


function getBranchDisplay(branch: string): string {
  const normalized = branch.toLowerCase().trim();
  for (const [key, display] of Object.entries(BRANCH_DISPLAY)) {
    if (normalized.includes(key)) return display;
  }
  return "virksomheder";
}

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
  branchDisplay: string; // human-readable plural, e.g. "tømrerfirmaer"
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
  food: {
    cold: (v) => {
      const ws = websiteLine(v);
      const text = `Hej ${v.name},

${ws}

Jeg har lavet et par demo-hjemmesider til restauranter — se dem her:
→ ${DEMO_URLS.food[0]}
→ ${DEMO_URLS.food[1]}

Det er kun demoer, men jeg laver selvfølgelig en fuld version der passer specifikt til ${v.name} — jeres stil, menu, farver og det hele.

Ring eller skriv hvis I vil se hvad det kunne se ud som.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Har I overvejet en ny hjemmeside, ${v.name}?`,
        text,
        html: buildHtml(`
<p>Hej ${v.name},</p>
<p>${ws}</p>
<p>Jeg har lavet et par demo-hjemmesider til restauranter — se dem her:<br>
→ <a href="${DEMO_URLS.food[0]}">${DEMO_URLS.food[0]}</a><br>
→ <a href="${DEMO_URLS.food[1]}">${DEMO_URLS.food[1]}</a></p>
<p>Det er kun demoer, men jeg laver selvfølgelig en fuld version der passer specifikt til <strong>${v.name}</strong> — jeres stil, menu, farver og det hele.</p>
<p>Ring eller skriv hvis I vil se hvad det kunne se ud som.</p>
<p>Lucas<br>+45 23 24 24 82</p>`, v.trackingPixelUrl),
      };
    },
    followup: (v) => {
      const text = `Hej igen ${v.name},

Jeg sendte en mail for en uges tid siden om en ny hjemmeside til jer — hørte ikke tilbage, men tilbuddet gælder stadig.

Se mine demoer til restauranter:
→ ${DEMO_URLS.food[0]}
→ ${DEMO_URLS.food[1]}

Ring eller skriv hvis I er nysgerrige.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Re: Hjemmeside til ${v.name}`,
        text,
        html: buildHtml(`
<p>Hej igen ${v.name},</p>
<p>Jeg sendte en mail for en uges tid siden om en ny hjemmeside til jer — hørte ikke tilbage, men tilbuddet gælder stadig.</p>
<p>Se mine demoer til restauranter:<br>
→ <a href="${DEMO_URLS.food[0]}">${DEMO_URLS.food[0]}</a><br>
→ <a href="${DEMO_URLS.food[1]}">${DEMO_URLS.food[1]}</a></p>
<p>Ring eller skriv hvis I er nysgerrige.</p>
<p>Lucas<br>+45 23 24 24 82</p>`, v.trackingPixelUrl),
      };
    },
  },

  craft: {
    cold: (v) => {
      const ws = websiteLine(v);
      const text = `Hej ${v.name},

Jeres arbejde taler for sig selv — hjemmesiden burde gøre det samme.

${ws}

Jeg har lavet en demo-hjemmeside til ${v.branchDisplay} som jeres — se den her:
→ ${DEMO_URLS.craft}

Det er kun en demo, men jeg laver en fuld version der passer specifikt til ${v.name}.

Ring eller skriv hvis du vil høre mere.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Hjemmeside til ${v.name}?`,
        text,
        html: buildHtml(`
<p>Hej ${v.name},</p>
<p>Jeres arbejde taler for sig selv — hjemmesiden burde gøre det samme.</p>
<p>${ws}</p>
<p>Jeg har lavet en demo-hjemmeside til ${v.branchDisplay} som jeres — se den her:<br>
→ <a href="${DEMO_URLS.craft}">${DEMO_URLS.craft}</a></p>
<p>Det er kun en demo, men jeg laver en fuld version der passer specifikt til <strong>${v.name}</strong>.</p>
<p>Ring eller skriv hvis du vil høre mere.</p>
<p>Lucas<br>+45 23 24 24 82</p>`, v.trackingPixelUrl),
      };
    },
    followup: (v) => {
      const text = `Hej igen ${v.name},

Jeg sendte en mail for en uges tid siden — hørte ikke tilbage, men tilbuddet gælder stadig.

Se min demo til ${v.branchDisplay}:
→ ${DEMO_URLS.craft}

Ring eller skriv.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Re: Hjemmeside til ${v.name}`,
        text,
        html: buildHtml(`
<p>Hej igen ${v.name},</p>
<p>Jeg sendte en mail for en uges tid siden — hørte ikke tilbage, men tilbuddet gælder stadig.</p>
<p>Se min demo til ${v.branchDisplay}:<br>
→ <a href="${DEMO_URLS.craft}">${DEMO_URLS.craft}</a></p>
<p>Ring eller skriv.</p>
<p>Lucas<br>+45 23 24 24 82</p>`, v.trackingPixelUrl),
      };
    },
  },

  photo: {
    cold: (v) => {
      const ws = websiteLine(v);
      const text = `Hej ${v.name},

Med det øje du har bag kameraet fortjener du en hjemmeside der viser det frem.

${ws}

Jeg har lavet en demo-hjemmeside til fotografer — se den her:
→ ${DEMO_URLS.photo}

Det er kun en demo, men jeg laver en fuld version der passer specifikt til dig — dit udtryk, dine billeder, din stil.

Ring eller skriv hvis du er nysgerrig.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Din hjemmeside, ${v.name}?`,
        text,
        html: buildHtml(`
<p>Hej ${v.name},</p>
<p>Med det øje du har bag kameraet fortjener du en hjemmeside der viser det frem.</p>
<p>${ws}</p>
<p>Jeg har lavet en demo-hjemmeside til fotografer — se den her:<br>
→ <a href="${DEMO_URLS.photo}">${DEMO_URLS.photo}</a></p>
<p>Det er kun en demo, men jeg laver en fuld version der passer specifikt til dig — dit udtryk, dine billeder, din stil.</p>
<p>Ring eller skriv hvis du er nysgerrig.</p>
<p>Lucas<br>+45 23 24 24 82</p>`, v.trackingPixelUrl),
      };
    },
    followup: (v) => {
      const text = `Hej igen ${v.name},

Jeg sendte en mail for en uges tid siden — hørte ikke tilbage, men tilbuddet gælder stadig.

Se min demo til fotografer:
→ ${DEMO_URLS.photo}

Ring eller skriv.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Re: Din hjemmeside, ${v.name}`,
        text,
        html: buildHtml(`
<p>Hej igen ${v.name},</p>
<p>Jeg sendte en mail for en uges tid siden — hørte ikke tilbage, men tilbuddet gælder stadig.</p>
<p>Se min demo til fotografer:<br>
→ <a href="${DEMO_URLS.photo}">${DEMO_URLS.photo}</a></p>
<p>Ring eller skriv.</p>
<p>Lucas<br>+45 23 24 24 82</p>`, v.trackingPixelUrl),
      };
    },
  },

  professional: {
    cold: (v) => {
      const ws = websiteLine(v);
      const text = `Hej ${v.name},

I ${v.city} kender folk jer. Hjemmesiden burde de også gøre.

${ws}

Jeg har lavet en demo-hjemmeside til virksomheder som jeres — se den her:
→ ${DEMO_URLS.professional}

Det er kun en demo, men jeg laver en fuld version der passer specifikt til ${v.name}.

Ring eller skriv hvis du vil høre mere.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Hjemmeside til ${v.name}?`,
        text,
        html: buildHtml(`
<p>Hej ${v.name},</p>
<p>I ${v.city} kender folk jer. Hjemmesiden burde de også gøre.</p>
<p>${ws}</p>
<p>Jeg har lavet en demo-hjemmeside til virksomheder som jeres — se den her:<br>
→ <a href="${DEMO_URLS.professional}">${DEMO_URLS.professional}</a></p>
<p>Det er kun en demo, men jeg laver en fuld version der passer specifikt til <strong>${v.name}</strong>.</p>
<p>Ring eller skriv hvis du vil høre mere.</p>
<p>Lucas<br>+45 23 24 24 82</p>`, v.trackingPixelUrl),
      };
    },
    followup: (v) => {
      const text = `Hej igen ${v.name},

Jeg sendte en mail for en uges tid siden — hørte ikke tilbage, men tilbuddet gælder stadig.

Se min demo:
→ ${DEMO_URLS.professional}

Ring eller skriv.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Re: Hjemmeside til ${v.name}`,
        text,
        html: buildHtml(`
<p>Hej igen ${v.name},</p>
<p>Jeg sendte en mail for en uges tid siden — hørte ikke tilbage, men tilbuddet gælder stadig.</p>
<p>Se min demo:<br>
→ <a href="${DEMO_URLS.professional}">${DEMO_URLS.professional}</a></p>
<p>Ring eller skriv.</p>
<p>Lucas<br>+45 23 24 24 82</p>`, v.trackingPixelUrl),
      };
    },
  },

  service: {
    cold: (v) => {
      const ws = websiteLine(v);
      const text = `Hej ${v.name},

${ws}

Mange i ${v.city} søger lokale ${v.branchDisplay} online — en god hjemmeside er det første de ser.

Skriv eller ring hvis du vil se hvad jeg kan lave til jer.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Hjemmeside til ${v.name}?`,
        text,
        html: buildHtml(`
<p>Hej ${v.name},</p>
<p>${ws}</p>
<p>Mange i ${v.city} søger lokale ${v.branchDisplay} online — en god hjemmeside er det første de ser.</p>
<p>Skriv eller ring hvis du vil se hvad jeg kan lave til jer.</p>
<p>Lucas<br>+45 23 24 24 82</p>`, v.trackingPixelUrl),
      };
    },
    followup: (v) => {
      const text = `Hej igen ${v.name},

Jeg sendte en mail for en uges tid siden om en hjemmeside til jer — tilbuddet gælder stadig.

Ring eller skriv.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Re: Hjemmeside til ${v.name}`,
        text,
        html: buildHtml(`
<p>Hej igen ${v.name},</p>
<p>Jeg sendte en mail for en uges tid siden om en hjemmeside til jer — tilbuddet gælder stadig.</p>
<p>Ring eller skriv.</p>
<p>Lucas<br>+45 23 24 24 82</p>`, v.trackingPixelUrl),
      };
    },
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
  vars: Omit<TemplateVars, "trackingPixelUrl" | "branchDisplay"> & { leadId: string }
): EmailTemplate {
  const group = getBranchGroup(branch);
  const template = TEMPLATES[group]?.[type] ?? TEMPLATES.craft[type];
  const trackingPixelUrl = buildTrackingPixelUrl(vars.leadId);
  const branchDisplay = getBranchDisplay(branch);
  return template({ ...vars, trackingPixelUrl, branchDisplay });
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
