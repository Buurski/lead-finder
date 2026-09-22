// Et leads rækkeindeks til de gamle sheets.ts-mutatorer: rowIndex = row_no − 2,
// hvor Lead.id = String(row_no). Må ALDRIG udledes af positionen i getLeads():
// Postgres-udgaven udelader arkiverede rækker, så positionen glider og en
// markering (svar, bounce, skip) rammer det forkerte lead. (Hotfix 22/9.)
export function leadRowIndex(lead: { id: string }): number {
  const n = Number(lead.id);
  if (!Number.isInteger(n) || n < 2) throw new Error(`ugyldigt lead-id: ${lead.id}`);
  return n - 2;
}
