// Afsendelse af månedsrapporten fra HQ: fra lucas@kinly.dk (senders.ts kundeAfsender),
// med PDF'en vedhæftet, til kundens kontakt (kundeKontakt, samme som fakturaen).
//
// To indgange: "Send nu" i HQ og cron'en (/api/cron/kunde-rapport), der sender
// rapporter hvis frist er gået, på hverdage i arbejdstid. Et test-send går til en
// valgfri adresse, får "[TEST]" i emnet og rører hverken lås eller levering.
import type { Transporter } from "nodemailer";
import type { Db } from "../db/client.ts";
import { appendSystemActivity } from "../crm.ts";
import { applySignature, applySignatureHtml, kundeAfsender } from "../senders.ts";
import { store } from "../store.ts";
import { kundeKontakt } from "./invoice-contacts.ts";
import { hentLevering, iArbejdstid, keyS, KundeRapportError, oversigt, rapportFor, saetLevering, type OversigtRaekke } from "./kunde-rapport.ts";
import type { RapportModel } from "./kunde-rapport-model.ts";

export { iArbejdstid };

type Afsender = Pick<Transporter, "sendMail">;

const MAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[a-z]{2,}$/i;

export interface SendResultat {
  til: string;
  emne: string;
  test: boolean;
}

/**
 * Sender én kundes rapport for én måned. Uden `test` markeres den sendt og fryses,
 * præcis som "Markér sendt". Kaster KundeRapportError ved alt der skal ses af et menneske.
 */
export async function sendKundeRapport(
  db: Db,
  host: string,
  ym: string,
  af: string,
  opts: { til?: string; test?: boolean; nu?: Date; afsender?: { transporter: Afsender; from: string }; pdf?: (r: RapportModel) => Promise<Buffer> } = {},
): Promise<SendResultat> {
  const nu = opts.nu ?? new Date();
  const test = opts.test === true;
  const rapport = await rapportFor(db, host, ym);
  if (!rapport) throw new KundeRapportError("der er ingen måling for måneden, så der er ingen rapport at sende");

  let til = (opts.til ?? "").trim();
  if (!test) {
    if ((await hentLevering(host, ym))?.status === "sendt") throw new KundeRapportError("rapporten er allerede sendt");
    if (!til) {
      const række = (await oversigt(db, ym)).raekker.find((r) => r.domaene === host);
      til = række?.companyId ? ((await kundeKontakt(db, række.companyId))?.to ?? "") : "";
    }
  }
  if (!MAIL_RE.test(til)) throw new KundeRapportError(til ? `"${til}" ligner ikke en mailadresse` : "kunden har ingen mail i HQ");

  const emne = test ? `[TEST] ${rapport.mail.emne}` : rapport.mail.emne;
  // Modellens tekst slutter med "Lucas"; signaturen skriver navnet selv.
  const brødtekst = rapport.mail.tekst.replace(/\n+Lucas\s*$/, "");
  // Dynamisk: node:test kan ikke indlæse .tsx, så testene giver deres egen renderer.
  const pdf = await (opts.pdf ?? (await import("../kunde-rapport-pdf.tsx")).renderKundeRapportPdf)(rapport);

  const afsender = opts.afsender ?? kundeAfsender(); // før låsen: mangler opsætningen, er intet sendt

  // ponytail: tjek-så-sæt, ikke atomisk. Cron'en kører én gang i timen, så et samtidigt
  // "Send nu" i samme sekund er den eneste vej til en dobbelt mail. Atomisk KV-SETNX hvis det sker.
  if (!test) {
    if (await store.get(keyS(host, ym))) {
      throw new KundeRapportError("rapporten er ved at blive sendt, eller blev måske sendt i et tidligere forsøg. Tjek Sendt-mappen i Gmail.");
    }
    await store.put(keyS(host, ym), { at: nu.toISOString(), af, til });
  }

  await afsender.transporter
    .sendMail({
      from: afsender.from,
      to: til,
      subject: emne,
      text: applySignature(brødtekst, "lucas"),
      html: applySignatureHtml(brødtekst, "lucas"),
      attachments: [{ filename: `Kinly-rapport-${host}-${ym}.pdf`, content: pdf, contentType: "application/pdf" }],
    })
    .catch(async (e) => {
      // Som fakturaen: kun når serveren med sikkerhed ikke fik mailen, frigives låsen.
      const code = (e as { code?: string })?.code ?? "";
      if (!test && ["EAUTH", "ECONNECTION", "EDNS", "EENVELOPE", "ETLS"].includes(code)) await store.delete(keyS(host, ym)).catch(() => {});
      throw e;
    });

  if (!test) {
    await saetLevering(host, ym, "sendt", af, undefined, nu, rapport, { til, at: nu.toISOString() });
    await store.delete(keyS(host, ym));
    await appendSystemActivity(rapport.kunde, `kunderapport_${host}_${ym}`, `Månedsrapport for ${ym} sendt til ${til}${af === "auto" ? " (automatisk)" : ""}`).catch(() => {});
  }
  return { til, emne, test };
}

/** Rækker cron'en må sende nu: klar, ingen stop-grund, frist gået. */
export const klarTilAuto = (raekker: OversigtRaekke[], nu: Date) =>
  raekker.filter((r) => r.status === "klar" && !r.auto.stop && r.auto.sendesEfter && Date.parse(r.auto.sendesEfter) <= nu.getTime());
