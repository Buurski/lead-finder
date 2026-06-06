// pick-filter.ts — which leads the daily engine PICK treats as "un-worked"
// (eligible for a fresh draft). PURE.
//
// A lead is un-worked if its status is blank or "new":
//   • Sheets values.get returns "" for a blank status cell when a LATER column
//     (e.g. email) is populated — so blank-but-real leads carry status "".
//   • getLeads defaults a truly-missing trailing cell to "new".
// Both mean "never worked", so both must be eligible. Any worked status —
// called / interested / client / skip — is excluded. Normalized (trim +
// lowercase) so a stray "New " / "NEW" from the sheet still counts.
export function isUnworkedStatus(status: unknown): boolean {
  const st = String(status ?? "").trim().toLowerCase();
  return st === "" || st === "new";
}
