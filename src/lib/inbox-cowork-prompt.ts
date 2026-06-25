// inbox-cowork-prompt.ts — generate the Markdown prompt a local Cowork/Opus task
// runs each morning to triage Lucas's inbox and push the result to the app.
//
// Same pattern as cowork-prompt.ts (deep research): the model call happens on
// Lucas's subscription (Opus 4.8 — free), reads Gmail via the Gmail tools it has
// locally, ranks what actually needs a reply, and POSTs an InboxDigest to
// /api/inbox/digest. The deployed app then just reads + renders it.
//
// 2026-06-26: account drives the suggestedReply closing line — Lucas's inbox
// closes "Mvh, Lucas", Charlie's inbox closes "Mvh, Charlie Nielsen".
//
// Strip-safe (no Next imports).

import { formatSignature, type SenderId } from "./senders.ts";

export interface InboxPromptOptions {
  appUrl?: string;
  apiSecret?: string;
  windowDays?: number;
  account?: SenderId; // "lucas" | "charlie" — drives the reply closing line
  maxItems?: number;
}

export function buildInboxTriagePrompt(opts: InboxPromptOptions = {}): string {
  const appUrl = opts.appUrl ?? "https://lead-finder-three-beta.vercel.app";
  const windowDays = opts.windowDays ?? 7;
  const account: SenderId = opts.account ?? "lucas";
  const maxItems = opts.maxItems ?? 40;
  const signature = formatSignature(account);
  const secretLine = opts.apiSecret
    ? `Authorization: Bearer ${opts.apiSecret}`
    : "# (sæt INBOX_DIGEST_SECRET env var, og tilføj: Authorization: Bearer $INBOX_DIGEST_SECRET)";

  return `# Indbakke-triage, ${account} (sidste ${windowDays} dage)

Du er ${account}'s assistent. Gennemgå deres Gmail-indbakke og find de mails der FAKTISK
kræver et svar — ikke alt, kun det væsentlige. Skriv resultatet tilbage til
Command Center som en rangeret digest.

## Hvorfor
"Svar"-siden viste før ALLE svar uden prioritering, for råt. Du laver i stedet en
kort, rangeret liste: de vigtigste øverst, støj (nyhedsbreve, kvitteringer,
autosvar, notifikationer) skjult.

## Process
1. Hent de seneste ~${windowDays} dages mails i INBOX (maks ~${maxItems}).
2. For hver mail, afgør:
   - **category**: client | interested | question | objection | admin | personal |
     not-interested | newsletter | auto-reply | receipt | spam | other
   - **needsReply** (bool): kræver den et personligt svar fra ${account}?
   - **importance** (0–100): hvor hurtigt bør han svare? (køber-intent højest)
   - **reason** (1 linje dansk): hvorfor vigtig, eller hvorfor støj
   - **suggestedReply** (kun for needsReply=true): kort, varmt dansk udkast,
     ingen priser/kr, ingen robot-CTA, afslut "${signature.closing}"
3. Drop åbenlys støj (sæt needsReply=false, lav importance) — men medtag den stadig
   i listen, så Lucas kan folde den ud.

## Output (InboxDigest JSON)

\`\`\`json
{
  "generatedAt": "<ISO timestamp>",
  "generatedBy": "cowork-opus",
  "account": "${account}",
  "windowDays": ${windowDays},
  "note": "<fx '38 scannet, 5 kræver svar'>",
  "items": [
    {
      "id": "<gmail thread/message id>",
      "account": "${account}",
      "from": "afsender@example.dk",
      "fromName": "Afsender Navn",
      "subject": "...",
      "snippet": "<kort preview>",
      "date": "<ISO>",
      "category": "interested",
      "importance": 88,
      "needsReply": true,
      "reason": "Spørger om en pris-snak, varm lead",
      "gmailLink": "https://mail.google.com/mail/u/0/#inbox/<id>",
      "suggestedReply": "Hej ...\\n\\n...\\n\\n${signature.closing}"
    }
  ]
}
\`\`\`

## Skriv tilbage
POST hele JSON-objektet til:

\`\`\`
POST ${appUrl}/api/inbox/digest
Content-Type: application/json
${secretLine}
\`\`\`

Bekræft med en kort summary i chatten: hvor mange scannet, hvor mange kræver svar,
top-3 vigtigste afsendere. Send INTET svar til nogen, du laver kun triage.
`;
}
