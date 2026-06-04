// seo-report.ts — turn a SeoResult into a calm monthly markdown report Lucas can
// paste into a client note or email. Pure formatting; no side effects.

import type { SeoResult } from "./seo.ts";

export function generateSeoReport(r: SeoResult): string {
  const date = r.ranAt.slice(0, 10);
  const lines: string[] = [];
  lines.push(`# SEO-rapport — ${r.name}`);
  lines.push("");
  lines.push(`**Dato:** ${date} · **Niveau:** ${r.tier === "tier_full" ? "fuld" : "basis"} · **Domæne:** ${r.domain || "(ingen)"}`);
  lines.push("");

  lines.push("## Schema.org (struktureret data)");
  if (r.schema) {
    lines.push(r.schema.found
      ? `Fundet: ${r.schema.types.join(", ")} (${r.schema.count} type${r.schema.count === 1 ? "" : "r"}).`
      : "Ingen JSON-LD schema fundet — anbefaling: tilføj LocalBusiness-schema.");
  } else {
    lines.push("Ikke tjekket (kunne ikke hente siden).");
  }
  lines.push("");

  lines.push("## Lighthouse");
  if (r.lighthouse?.scores) {
    const s = r.lighthouse.scores;
    lines.push(`Performance ${s.performance} · Accessibility ${s.accessibility} · Best Practices ${s.bestPractices} · SEO ${s.seo}`);
  } else {
    lines.push(r.lighthouse?.note ?? "Ikke kørt.");
  }
  lines.push("");

  if (r.tier === "tier_full") {
    lines.push("## Google-indeksering");
    lines.push(r.index?.indexed != null ? `Ca. ${r.index.indexed} sider indekseret.` : `Ikke målt (${r.index?.note ?? "n/a"}).`);
    lines.push("");
    lines.push("## AI-søgnings-synlighed");
    if (r.aiVisibility?.mentioned == null) lines.push(`Ikke målt (${r.aiVisibility?.detail ?? "n/a"}).`);
    else lines.push(r.aiVisibility.mentioned ? "Modellen kender klienten og linker korrekt." : "Modellen kender ikke klienten endnu — arbejdspunkt.");
    if (r.aiVisibility?.detail) lines.push(`\n> ${r.aiVisibility.detail}`);
    lines.push("");
  }

  if (r.notes.length) {
    lines.push("## Noter");
    r.notes.forEach((n) => lines.push(`- ${n}`));
  }
  return lines.join("\n");
}
