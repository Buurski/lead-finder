import type { DeepResearch } from "@/app/api/leads/[id]/deep-research/route";

export interface BriefData {
  clientName: string;
  branch: string;
  city: string;
  customers: string;
  tone: string;
  colorVibe: string;
  services: string;
  differentiator: string;
  antiReferences: string;
  hasLogo: string;
}

export function buildClaudeMd(brief: BriefData, research?: DeepResearch): string {
  const lines: string[] = [];

  lines.push(`# ${brief.clientName} — Website Project`);
  lines.push("");
  lines.push(`> **Åbn Claude Code i denne mappe** og brug \`$impeccable craft\` eller \`$huashu-design\`.`);
  lines.push(`> Konteksten nedenfor er hentet automatisk — brug den til at svare på skillenes spørgsmål hurtigt.`);
  lines.push("");

  lines.push("## Virksomhed");
  lines.push(`- **Navn:** ${brief.clientName}`);
  lines.push(`- **Branche:** ${brief.branch}`);
  lines.push(`- **By:** ${brief.city}`);
  if (research?.googleRating) {
    lines.push(`- **Google Maps:** ${research.googleRating}/5 (${research.googleReviewCount} anmeldelser)`);
  }
  if (research?.googleCategories?.length) {
    lines.push(`- **Kategorier:** ${research.googleCategories.join(", ")}`);
  }
  if (research?.googleHours) {
    lines.push(`- **Åbningstider:** ${research.googleHours}`);
  }
  if (brief.hasLogo) {
    lines.push(`- **Logo:** ${brief.hasLogo}`);
  }
  lines.push("");

  lines.push("## Nuværende online tilstedeværelse");
  if (brief.clientName && research?.website) {
    lines.push(`- **Hjemmeside:** ${research.website}`);
  } else {
    lines.push(`- **Hjemmeside:** Ingen`);
  }
  if (research?.facebookUrl) {
    lines.push(`- **Facebook:** ${research.facebookUrl}`);
  }
  if (research?.facebookDescription) {
    lines.push(`- **Facebook beskrivelse:** ${research.facebookDescription}`);
  }
  lines.push("");

  lines.push("## Brief");
  lines.push(`- **Kunder:** ${brief.customers}`);
  lines.push(`- **Tone i 3 ord:** ${brief.tone}`);
  lines.push(`- **Farvestemning:** ${brief.colorVibe}`);
  lines.push(`- **Hvad skiller dem ud:** ${brief.differentiator}`);
  if (brief.antiReferences) {
    lines.push(`- **Sites de ikke kan lide:** ${brief.antiReferences}`);
  }
  lines.push("");

  lines.push("### Ydelser");
  lines.push(brief.services);
  lines.push("");

  if (research?.googleDescription) {
    lines.push("## Google Maps beskrivelse");
    lines.push(research.googleDescription);
    lines.push("");
  }

  if (research?.websitePages?.length) {
    lines.push("## Indhold fra nuværende hjemmeside");
    lines.push("*Automatisk hentet og renset — brug dette til at forstå virksomhedens sprog og tone.*");
    lines.push("");
    for (const page of research.websitePages.slice(0, 6)) {
      if (!page.text.trim()) continue;
      lines.push(`### ${page.title || page.url}`);
      lines.push(page.text.slice(0, 1200).trim());
      lines.push("");
    }
  }

  lines.push("## PRODUCT.md (for impeccable skill)");
  lines.push("```");
  lines.push(`# ${brief.clientName}`);
  lines.push("");
  lines.push(`## Users`);
  lines.push(brief.customers);
  lines.push("");
  lines.push(`## Brand Tone`);
  lines.push(brief.tone);
  lines.push("");
  lines.push(`## Product Purpose`);
  lines.push(`Lokal ${brief.branch.toLowerCase()} i ${brief.city}. Hjemmeside skal skabe tillid og få kunder til at ringe.`);
  lines.push("");
  lines.push(`## Strategic Principles`);
  lines.push(`- Lokal og nærværende — ${brief.city}-området`);
  lines.push(`- Enkel navigation — folk skal hurtigt finde telefonnummer og ydelser`);
  lines.push(`- Troværdighed gennem ærlighed — ingen generiske slogans`);
  lines.push(`- Mobil-first — størstedelen af besøgende er på telefon`);
  if (brief.antiReferences) {
    lines.push("");
    lines.push(`## Anti-references`);
    lines.push(brief.antiReferences);
  }
  lines.push("```");
  lines.push("");

  lines.push("## Brand Brief (for huashu-design / impeccable)");
  lines.push(`- **Farvestemning:** ${brief.colorVibe}`);
  lines.push(`- **Logo:** ${brief.hasLogo}`);
  lines.push(`- **Differentiator:** ${brief.differentiator}`);
  lines.push("");

  lines.push("## Instruktioner til Claude Code");
  lines.push("");
  lines.push("Brug én af disse skills:");
  lines.push("- **`$impeccable craft`** — fuld produktionsklar hjemmeside (anbefalet)");
  lines.push("- **`$huashu-design`** — HTML high-fidelity designprototype");
  lines.push("");
  lines.push("Konteksten ovenfor besvarer de fleste af skillenes spørgsmål. Svar kort og præcist når de spørger.");
  lines.push("Brug det råmateriale der er hentet fra deres hjemmeside til at skrive autentisk kopi — undgå generiske vendinger.");
  if (research?.facebookUrl) {
    lines.push(`Facebook-side: ${research.facebookUrl} — tjek for billeder og kundeanmeldelser.`);
  }

  return lines.join("\n");
}
