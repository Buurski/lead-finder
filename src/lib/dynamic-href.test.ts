// Kildekode-vagt: de fire flader hvor et href kan bygges af data udefra
// (Sheets/Places, agentrapport, DB, agent-/bruger-POST) skal sende værdien gennem
// safeHref. Testen læser selve kilden — et råt `href={…}` udefra skal fejle med fil+linje.
//
// Ikke med her: MessengerPanel.fbPageUrl får sin egen kildekodetest på
// agent/0927-1503-messenger-safe-href (der laves ingen dublet her), og
// messengerUrl kommer fra handle.ts' messengerUrlFor med fast https-prefix + regex.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

interface Surface {
  file: string;
  /** Rå href-expressions der bevidst IKKE er safeHref — interne konstanter/ruter, med grund. */
  allowRaw?: Record<string, string>;
}

const SURFACES: Surface[] = [
  { file: "app/leadgen/LeadgenPanel.tsx" },
  {
    file: "components/konkurrenter/KonkurrenterBoard.tsx",
    allowRaw: {
      '"/blog"': "intern rute",
      '"/opgaver"': "intern rute",
      "fbAdsUrl(c.name)": "bygger selv konstant https-URL + encodeURIComponent",
      "googleAdsUrl(c.url)": "bygger selv konstant https-URL, kun domæne hvis det matcher /^[a-z0-9.-]+$/i",
    },
  },
  {
    file: "app/seo/SeoHistoryPage.tsx",
    allowRaw: {
      GSC_URL: "intern konstant i seo-signals.ts",
      "a.href": "kommer kun fra seoActions() — GSC_URL, /blog, https://kinly.dk",
    },
  },
  {
    file: "app/tests/TestsBoard.tsx",
    allowRaw: { 'e.source.from === "seo" ? "/seo" : "/konkurrenter"': "interne ruter" },
  },
];

/** Finder `href={ … }` (kan gå over flere linjer) med linjenummer. */
function hrefExpressions(src: string): { expr: string; line: number }[] {
  const out: { expr: string; line: number }[] = [];
  const re = /href=\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length;
    let depth = 1;
    let quote = "";
    let i = start;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (quote) {
        if (ch === "\\") i++;
        else if (ch === quote) quote = "";
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) break;
    }
    out.push({ expr: src.slice(start, i).replace(/\s+/g, " ").trim(), line: src.slice(0, m.index).split("\n").length });
  }
  return out;
}

/** Exprenter der er trygge fordi de er interne: literal-strenge, konstanter, safeHref-resultater. */
function isSafe(expr: string, guarded: Set<string>): boolean {
  if (expr.includes("safeHref(")) return true;
  if (guarded.has(expr)) return true;
  if (/^["'`]/.test(expr)) return true; // literal eller skabelon med fast skema
  return false;
}

test("dynamiske hrefs i leadgen, konkurrenter, SEO og tests går gennem safeHref", () => {
  const bad: string[] = [];
  for (const surface of SURFACES) {
    const src = readFileSync(new URL(`../${surface.file}`, import.meta.url), "utf8");
    const guarded = new Set(
      [...src.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*safeHref\s*\(/g)].map((m) => m[1]),
    );
    const hrefs = hrefExpressions(src);
    assert.ok(hrefs.length > 0, `ingen href fundet i src/${surface.file} — er filen flyttet?`);
    for (const { expr, line } of hrefs) {
      if (isSafe(expr, guarded)) continue;
      if (surface.allowRaw?.[expr]) continue;
      bad.push(`src/${surface.file}:${line} rå href: ${expr}`);
    }
  }
  assert.equal(bad.length, 0, `dynamisk href uden safeHref:\n${bad.join("\n")}`);
});
