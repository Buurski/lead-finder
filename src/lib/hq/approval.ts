// Godkendelses-markør i en opgaves Note. Klient-sikker med vilje (ingen
// "server-only"-import): både server (tasks.ts) og klient (TaskRow/
// TaskEditDialog) læser og skriver den samme, ordrette linje.
//
// Format, ALTID som første linje i noten:
//   Beslutning fra Lucas AFVENTER
// Alt efter første linje er opgavens egen note og røres ikke af denne fil.
//
// En markør længere nede i teksten tæller ikke, og en almindelig opgave hvis
// titel starter med "Godkend" er ikke en godkendelsesopgave — kun notens
// første linje afgør det.

export type ApprovalStatus = "afventer" | "godkendt" | "afvist";
export interface Approval {
  status: ApprovalStatus;
  actor: "Lucas" | "Charlie";
}

export const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  afventer: "Afventer godkendelse",
  godkendt: "Godkendt",
  afvist: "Afvist",
};

const MARKER = /^Beslutning fra (Lucas|Charlie) (AFVENTER|GODKENDT|AFVIST)$/;
const STATUS: Record<string, ApprovalStatus> = { AFVENTER: "afventer", GODKENDT: "godkendt", AFVIST: "afvist" };
const TOKEN: Record<ApprovalStatus, string> = { afventer: "AFVENTER", godkendt: "GODKENDT", afvist: "AFVIST" };

/** Læser KUN første linje. Alt andet (skjult markør, ukendt navn/status) → null. */
export function parseApproval(note: string): Approval | null {
  const first = (note.split("\n")[0] ?? "").replace(/\r$/, "").trim();
  const m = MARKER.exec(first);
  if (!m) return null;
  return { actor: m[1] as Approval["actor"], status: STATUS[m[2]] };
}

/** Selve markørlinjen, fx "Beslutning fra Lucas AFVENTER". */
export function approvalLine(actor: Approval["actor"], status: ApprovalStatus): string {
  return `Beslutning fra ${actor} ${TOKEN[status]}`;
}

/**
 * Sætter markøren ØVERST uden at fjerne noget — til en opgave der endnu ikke
 * er en godkendelsesopgave. Notens egen tekst bevares under markøren.
 */
export function prependApproval(note: string, actor: Approval["actor"]): string {
  return note.trim() ? `${approvalLine(actor, "afventer")}\n${note}` : approvalLine(actor, "afventer");
}

/**
 * Erstatter FØRSTE linje med en ny markør og bevarer resten af noten ordret
 * (byte for byte efter første "\n"). Note uden linjeskift → kun markøren.
 */
export function withApproval(note: string, actor: Approval["actor"], status: ApprovalStatus): string {
  const nl = note.indexOf("\n");
  const rest = nl === -1 ? "" : note.slice(nl + 1);
  return rest ? `${approvalLine(actor, status)}\n${rest}` : approvalLine(actor, status);
}

/** Checkboxen arbejder på den aktuelle textarea, aldrig den oprindelige note. */
export function applyApprovalChoice(note: string, needs: boolean, decided: boolean, actor: Approval["actor"]): string {
  const current = parseApproval(note);
  if (decided || (current && current.status !== "afventer")) return note;
  if (needs) return current ? withApproval(note, actor, "afventer") : prependApproval(note, actor);
  if (current?.status === "afventer") {
    const nl = note.indexOf("\n");
    return nl === -1 ? "" : note.slice(nl + 1);
  }
  return note;
}
