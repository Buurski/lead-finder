// compose.ts — compose a cold/follow-up email ONCE, deterministically, at
// draft time, then store it and send it AS-IS. This closes the Council finding
// that the tone-mixer was isolated from the send pipeline (the engine drafted
// nice copy but bulk-send re-rendered from old templates). Now the engine calls
// composeColdEmail and persists the exact bytes; send routes mail those bytes.
//
// Strip-safe (no enums) so the node engine can import it. THROWS on a voice-rule
// violation — a bad compose must never silently reach the queue.

import { mixForLead } from "./tone-mixer.ts";
import type { MixLead, OpenerKind } from "./tone-mixer.ts";
import { pickDemoPair } from "./demos.ts";
import type { Demo } from "./demos.ts";
import { validateDraft } from "./draft.ts";

export interface ComposeLead extends MixLead {
  name: string;
  branch: string;
  city?: string;
}

export interface ComposedEmail {
  subject: string;
  text: string;
  html: string;
  comboId: string;
  openerKind: OpenerKind;
  demoPair: [Demo, Demo];
}

function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function pickSubject(name: string, seed: string): string {
  const opts = [`En lille hilsen til ${name}`, `En idé til ${name}`, `Tænkte på ${name}`];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return opts[h % opts.length];
}

function tailorLine(name: string): string {
  return `Det er bare eksempler — en rigtig version til ${name} ville selvfølgelig matche jeres egen stil og farver.`;
}

function pickVariant(seed: string, variants: string[]): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return variants[h % variants.length];
}

// The "you deserve a real site" value paragraph (Lucas, 2026-06-19). Makes the
// cold mail a touch longer + more personal, leaning on the lead's reputation and
// customer base, with the angle: a site that CREATES new customers, not just keeps
// the current ones. Varied per business via the name seed. MUST stay voice-safe
// (no price/kr/gratis/robot-CTA) — composeColdEmail validates the whole body.
function valueLine(name: string): string {
  return pickVariant(name + "v", [
    `En virksomhed med jeres kundebase, erfaring og drive fortjener en ny og fungerende hjemmeside — en der skaber flere kunder, ikke bare beholder de nuværende.`,
    `Med det ry og de anmeldelser I har bygget op, fortjener I et website der matcher niveauet — et der henter nye kunder ind, frem for bare at vise de nuværende vej.`,
    `Med den kundebase I har, giver det god mening med en side der er lige så stærk som jeres ry — en der skaber nye henvendelser, ikke bare bevarer det I allerede har.`,
  ]);
}

function buildText(name: string, opener: string, disclosure: string, demoIntro: string, demos: [Demo, Demo], closing: string, valueText?: string): string {
  return [
    `Hej ${name},`,
    ``,
    `${opener} ${disclosure}`,
    ...(valueText ? [``, valueText] : []),
    ``,
    demoIntro,
    `→ ${demos[0].url}`,
    `→ ${demos[1].url}`,
    ``,
    tailorLine(name),
    ``,
    closing,
    ``,
    `Mvh, Lucas`,
  ].join("\n");
}

function textToHtml(text: string, demos: [Demo, Demo]): string {
  const paras = text.split("\n\n").map((block) => {
    const lines = block.split("\n").map((l) => {
      const m = l.match(/^→\s*(\S+)$/);
      if (m) return `<a href="${esc(m[1])}" style="color:#3a6b4f">${esc(m[1])}</a>`;
      return esc(l);
    });
    return `<p style="margin:0 0 14px;line-height:1.6">${lines.join("<br>")}</p>`;
  });
  void demos;
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#222;max-width:560px">${paras.join("")}</div>`;
}

// Compose a cold email once. Throws if the body breaks a HARD voice rule.
export function composeColdEmail(lead: ComposeLead): ComposedEmail {
  const mix = mixForLead(lead);
  const demos = pickDemoPair(lead.branch, lead.name);
  const text = buildText(lead.name, mix.opener, mix.disclosure, mix.demoIntro, demos, mix.closing, valueLine(lead.name));

  const check = validateDraft(text);
  if (!check.ok) {
    throw new Error(`composeColdEmail voice violation for "${lead.name}": ${check.errors.join("; ")}`);
  }

  return {
    subject: pickSubject(lead.name, lead.name + "s"),
    text,
    html: textToHtml(text, demos),
    comboId: mix.comboId,
    openerKind: mix.openerKind,
    demoPair: demos,
  };
}

// Compose a follow-up that deliberately uses a DIFFERENT opener kind than the
// first touch (variation lifts reply rates per OUTREACH_ANALYSIS). Deterministic:
// we re-seed the mixer until the opener kind differs (max a few tries).
export function composeFollowupEmail(lead: ComposeLead, previousOpenerKind?: OpenerKind): ComposedEmail {
  let chosen = mixForLead(lead);
  for (let i = 1; i <= 4 && previousOpenerKind && chosen.openerKind === previousOpenerKind; i++) {
    chosen = mixForLead({ ...lead, name: `${lead.name}${"·".repeat(i)}` });
  }
  const demos = pickDemoPair(lead.branch, lead.name);
  const followIntro = "Lille opfølgning — jeg ville bare lige høre om det kunne være noget.";
  const text = buildText(lead.name, chosen.opener, `${chosen.disclosure} ${followIntro}`, chosen.demoIntro, demos, chosen.closing);

  const check = validateDraft(text);
  if (!check.ok) {
    throw new Error(`composeFollowupEmail voice violation for "${lead.name}": ${check.errors.join("; ")}`);
  }

  return {
    subject: `Re: ${pickSubject(lead.name, lead.name + "s")}`,
    text,
    html: textToHtml(text, demos),
    comboId: chosen.comboId,
    openerKind: chosen.openerKind,
    demoPair: demos,
  };
}
