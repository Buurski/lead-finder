// cowork-prompt.ts — generate a structured Markdown prompt that a Cowork
// session (or any Claude agent) can execute to process a deep-research batch.
//
// The pattern: instead of paying API tokens for deep research, the Command
// Center generates a self-contained prompt that includes:
//   1. What to do (process N leads from the queue).
//   2. The tools to use (web search, safe-fetch, recon).
//   3. The expected output format (JSON matching ResearchResult interface).
//   4. How to write results back (POST to /api/leads/deep-research-result).
//
// Lucas opens Cowork, pastes the prompt, and walks away. Cowork does the work,
// posts results back, sends a Gmail notification.
//
// Strip-safe (no enums) so the node engine can import this.

import type { QueueEntry } from "./deep-research-queue.ts";

export interface CoworkPromptOptions {
  batchSize?: number;            // default 10
  appUrl?: string;               // base URL of Command Center (for callback)
  apiSecret?: string;            // shared secret for POST-back endpoint
  includeWebSearch?: boolean;    // default true
}

const DEFAULT_BATCH = 10;

export function buildCoworkPrompt(
  entries: QueueEntry[],
  opts: CoworkPromptOptions = {},
): string {
  const batch = entries.slice(0, opts.batchSize ?? DEFAULT_BATCH);
  const appUrl = opts.appUrl ?? "https://lead-finder-three-beta.vercel.app";
  const secretLine = opts.apiSecret
    ? `\nAuthorization: Bearer ${opts.apiSecret}`
    : "\n# (set DEEP_RESEARCH_SECRET env var, then add: Authorization: Bearer $DEEP_RESEARCH_SECRET)";

  const leadList = batch
    .map((e, i) => {
      const fields = [
        `${i + 1}. **${e.name}** (${e.branch})`,
        `   - leadId: \`${e.leadId}\``,
        `   - by: ${e.city || "ukendt"}`,
        `   - website: ${e.website || "ingen"}`,
        `   - email: ${e.email || "ingen"}`,
        `   - shallow-score: ${e.shallowScore}`,
      ];
      return fields.join("\n");
    })
    .join("\n\n");

  return `# Deep Research Batch — ${batch.length} leads

Du er en research-assistent for Lucas Buur (freelance web-designer i Danmark).
Du skal lave dyb analyse af ${batch.length} leads og skrive resultaterne tilbage til Command Center.

## Hvorfor

Lucas pitcher web-design til lokale danske SMB'er. Han kontakter KUN virksomheder
hvor han realistisk kan vinde dem som kunde. Du skal finde:

1. Om deres nuværende website er forældet (room to upgrade)
2. Om de allerede har et bureau (gør dem mindre vundne)
3. Achievements/priser de har vundet (giver opener-stof til mailen)
4. Email-kvalitet (personal > kontakt > info > generic)
5. Konkret pitch-vinkel (hvad er deres største web-design problem?)
6. Hvilke 2 demoer fra Lucas's katalog passer bedst

## Process for hver lead

1. **Read** deres website (brug \`safeFetch\` eller \`fetch\` direkte, max 9s timeout)
2. **Web-search**: "{navn} {by} anmeldelser" og "{navn} priser kåret" — find anerkendelser
3. **Analyser**:
   - copyright-år i footer + design-vibe
   - "Made by [bureau]" footer? (regex efter "wedo|web1|made by|by [a-z]+\\.dk")
   - emails synlige? hvilken type? (kontakt@, info@, personlig@)
   - mobile-responsive? (kort visuel check)
4. **Output** ResearchResult JSON (skema nedenfor)
5. **POST** til \`${appUrl}/api/leads/deep-research-result\`${secretLine}

## Output-format (ResearchResult)

\`\`\`json
{
  "leadId": "<from queue entry>",
  "generatedAt": "<ISO timestamp>",
  "generatedBy": "cowork-session",
  "websiteSummary": "Wordpress fra 2018, sterk visuel identitet men klumpet mobil-layout.",
  "designVerdict": "Dated. Hjerne fra ~2018, bruger forældet Slider Revolution.",
  "achievementsFound": ["Kåret som årets frisør 2024 i Tønder"],
  "madeByBureau": null,
  "emailQualityTier": "kontakt",
  "reviewVelocity90d": 8,
  "lighthouseScoreMobile": 42,
  "socialPresence": ["instagram:@frisørrita"],
  "pitchAngle": "Mobil-broken pga forældet slider; tilbud nyt minimalistisk design.",
  "recommendedDemos": ["Salon Artec", "Streetcut"],
  "compositeScoreDelta": 15,
  "notes": "Aktiv på Instagram, lyder klar til opgradering."
}
\`\`\`

## Felter forklaret

- **compositeScoreDelta**: hvor meget skal vi ÆNDRE baseline-scoren? -30 til +30. Positiv = bedre lead end først antaget. Negativ = værre.
- **emailQualityTier**: "personal" (ejer@x.dk) > "kontakt" > "info" > "generic" (admin@) > "noreply"
- **madeByBureau**: hvis du finder "Made by xyz.dk" eller "Powered by [bureau]" i footer, sæt navnet. Ellers \`null\`.
- **reviewVelocity90d**: anslået antal nye Google-reviews sidste 90 dage. Brug Google Maps/Places hvis muligt.
- **lighthouseScoreMobile**: kør hurtig PageSpeed Insights API call hvis du kan, ellers gæt baseret på visuel inspektion.

## Tools du har tilgængelig

- Web search (find achievements, anmeldelser, social profiler)
- Fetch (download website HTML for inspektion)
- safe-fetch (i lead-finder repo) — SSRF-safe alternativ
- Chrome MCP hvis tilgængelig (screenshots, JS rendering)

## Failure handling

Hvis en lead fejler (website down, timeout, ingen data), POST stadig med:
\`\`\`json
{
  "leadId": "...",
  "generatedAt": "...",
  "generatedBy": "cowork-session",
  "notes": "Failed: <reason>",
  "compositeScoreDelta": -10
}
\`\`\`
Så vi ved at den er behandlet og ikke prøver igen.

## Leads at processe

${leadList}

## Når du er færdig

Send mig en kort summary i Cowork chat:
- Hvor mange leads behandlet
- Hvor mange "made by bureau" (frasorteret)
- Top 3 leads efter compositeScoreDelta
- Eventuelle issues

God arbejdslyst.
`;
}
