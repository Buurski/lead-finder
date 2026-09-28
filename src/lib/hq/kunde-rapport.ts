// kunde-rapport.ts — status for den månedlige SEO-rapport pr. kunde pr. måned.
//
// Kilden er filerne rapport-jobbet skriver på VPS'en:
//   ~/.hermes/state/kunde-rapport/<domaene>-<maaned>.json  (+ PDF'en ved siden af)
// med felterne kunde, domaene, maaned, variant, pdf, koert, status, note, og
// sendt (ISO-tid, sat af kunde_rapport_status.py når nogen markerer den sendt).
//
// Vercel kan ikke læse VPS'ens disk, så vi læser den lokale mappe når den
// findes (dev og VPS), og falder ellers tilbage til VPS-broen:
// GET /api/kunde-rapport på hermes-api — samme mønster som /api/synlighed.
// Ingen DB: filerne ER sandheden, og et felt for meget ville kunne komme ud af
// trit med dem.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hermesFetch } from "../hermes.ts";

/** "med-adgang" = vi har Search Console/analytics. "uden-adgang" = kun det vi kan måle på siden. */
export type RapportVariant = "med-adgang" | "uden-adgang";
/** koert = rapporten er bygget (endnu ikke sendt) · kladde = mailen ligger klar · sendt · sprunget = bevidst sprunget over (grund i note). */
export type RapportStatus = "koert" | "kladde" | "sendt" | "sprunget";

export interface KundeRapport {
  kunde: string;
  domaene: string;
  maaned: string; // "2026-09"
  variant: string;
  pdf: string;
  koert: string;
  status: string;
  note: string;
  sendt?: string;
}

/** mangler = ingen rapport i måneden (hele pointen) · afventer = bygget/kladde, ikke sendt · sprunget · sendt. */
export type RapportFlag = "mangler" | "afventer" | "sprunget" | "sendt";

export interface RapportRaekke extends KundeRapport {
  flag: RapportFlag;
}

export interface RapportOversigt {
  maaned: string; // måneden oversigten dømmer: den nyeste måned i materialet
  maaneder: string[];
  raekker: RapportRaekke[];
  taeller: Record<RapportFlag, number>;
  kilde: "filer" | "bro" | "ingen";
  note?: string;
}

const MAANED_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Mappen rapport-jobbet skriver i. Kan overstyres med KUNDE_RAPPORT_DIR. */
export const KUNDE_RAPPORT_DIR = process.env.KUNDE_RAPPORT_DIR || path.join(os.homedir(), ".hermes", "state", "kunde-rapport");

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Én JSON-fil → række. Uden domæne og gyldig måned kan rækken ikke bruges. */
export function parseRapport(raw: unknown): KundeRapport | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const domaene = str(r.domaene);
  const maaned = str(r.maaned);
  if (!domaene || !MAANED_RE.test(maaned)) return null;
  const sendt = str(r.sendt);
  return {
    kunde: str(r.kunde) || domaene,
    domaene,
    maaned,
    variant: str(r.variant),
    pdf: str(r.pdf),
    koert: str(r.koert),
    status: str(r.status) || "koert",
    note: str(r.note),
    ...(sendt ? { sendt } : {}),
  };
}

export function flagFor(status: string): RapportFlag {
  if (status === "sendt") return "sendt";
  if (status === "sprunget") return "sprunget";
  // koert, kladde og ukendt status tæller som "ikke sendt endnu" — en tastefejl
  // i status må ikke se ud som om kunden har fået noget.
  return "afventer";
}

export function laesMappe(dir = KUNDE_RAPPORT_DIR): KundeRapport[] | null {
  if (!dir || !fs.existsSync(dir)) return null;
  const rows: KundeRapport[] = [];
  for (const navn of fs.readdirSync(dir)) {
    if (!navn.endsWith(".json")) continue;
    try {
      const r = parseRapport(JSON.parse(fs.readFileSync(path.join(dir, navn), "utf-8")));
      if (r) rows.push(r);
    } catch {
      // En halvskrevet eller ugyldig fil må ikke vælte hele oversigten.
    }
  }
  return rows;
}

/**
 * Oversigt pr. kunde pr. måned. Måneden vi dømmer er den nyeste i materialet
 * (er jobbet ikke kørt i denne måned, dømmer vi altså sidste måned frem for at
 * lyse hele listen rødt). `maaned` kan tvinge en anden måned.
 */
export function buildOversigt(rows: KundeRapport[], maaned?: string): Omit<RapportOversigt, "kilde" | "note"> {
  const maaneder = [...new Set(rows.map((r) => r.maaned))].sort();
  const target = maaned ?? maaneder[maaneder.length - 1] ?? new Date().toISOString().slice(0, 7);

  const iMaaned = rows.filter((r) => r.maaned === target);
  const kendte = new Set(iMaaned.map((r) => r.domaene));

  // Kunder der har fået en rapport før (uanset status), men intet har i måneden.
  // Bevidst også dem der sidst stod som sprunget: en udmeldt pas-kunde skal
  // markeres sprunget igen, ellers kan et fravalg se ud som en fejl.
  const mangler: RapportRaekke[] = [];
  const sidste = new Map<string, KundeRapport>();
  for (const r of rows) {
    if (r.maaned >= target || kendte.has(r.domaene)) continue;
    const før = sidste.get(r.domaene);
    if (!før || r.maaned > før.maaned) sidste.set(r.domaene, r);
  }
  for (const r of sidste.values()) {
    mangler.push({
      kunde: r.kunde,
      domaene: r.domaene,
      maaned: target,
      variant: r.variant,
      pdf: "",
      koert: "",
      status: "",
      note: `ingen rapport i ${target} (sidst ${r.maaned})`,
      flag: "mangler",
    });
  }

  const alle: RapportRaekke[] = [...iMaaned.map((r) => ({ ...r, flag: flagFor(r.status) })), ...mangler];
  const flagOrden: Record<RapportFlag, number> = { mangler: 0, afventer: 1, sprunget: 2, sendt: 3 };
  alle.sort(
    (a, b) =>
      Number(b.maaned === target) - Number(a.maaned === target) ||
      b.maaned.localeCompare(a.maaned) ||
      flagOrden[a.flag] - flagOrden[b.flag] ||
      a.kunde.localeCompare(b.kunde, "da"),
  );

  const taeller: Record<RapportFlag, number> = { mangler: 0, afventer: 0, sprunget: 0, sendt: 0 };
  for (const r of alle) if (r.maaned === target) taeller[r.flag] += 1;

  return { maaned: target, maaneder, raekker: alle, taeller };
}

/** Læser filerne lokalt, ellers gennem VPS-broen. `mappe` bruges af testen. */
export async function loadKundeRapport(maaned?: string, mappe = KUNDE_RAPPORT_DIR): Promise<RapportOversigt> {
  let rows: KundeRapport[] | null = null;
  let kilde: RapportOversigt["kilde"] = "filer";
  let note: string | undefined;

  try {
    rows = laesMappe(mappe);
  } catch (e) {
    note = `kunne ikke læse ${mappe}: ${String(e)}`;
  }

  if (!rows) {
    const svar = await hermesFetch<{ ok?: boolean; rapporter?: unknown[] }>("GET", "/api/kunde-rapport", undefined, 8_000);
    const liste = svar.status === 200 && Array.isArray(svar.data?.rapporter) ? svar.data.rapporter : null;
    if (liste) {
      rows = liste.map(parseRapport).filter((r): r is KundeRapport => r !== null);
      kilde = "bro";
    } else {
      kilde = "ingen";
      note = "hverken den lokale mappe eller VPS-broen svarede";
    }
  }

  return { ...buildOversigt(rows ?? [], maaned), kilde, ...(note ? { note } : {}) };
}

/** Dansk kortform af en ISO-tid. Tom streng når tidspunktet mangler. */
export function kortDato(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });
}
