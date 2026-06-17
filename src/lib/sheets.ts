import { google } from "googleapis";

import { planRowDeletionRanges } from "./leads/row-plan.ts";

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID!;

function getAuth() {
  // On Vercel: set GOOGLE_SERVICE_ACCOUNT_JSON to the full service account JSON string
  // Locally: set GOOGLE_KEY_FILE to the path of the service account JSON file
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  }
  return new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_KEY_FILE,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function getSheetsClient() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

export type LeadStatus = "new" | "called" | "interested" | "client" | "skip" | "not-interested";
export type WebsiteQualityTier = "modern" | "mediocre" | "old" | "dead" | "";

// Reasons used by the morning-review queue to flag a lead so today's cold-mail
// or follow-up gets skipped. Kept as a string union so the values can be
// written straight to the sheet without an extra mapping.
export type SkipReason =
  | ""
  | "cloudflare_false_positive"
  | "chain"
  | "bad_fit"
  | "wrong_template"
  | "already_contacted_elsewhere"
  | "other";

export interface Lead {
  id: string;
  name: string;
  branch: string;
  phone: string;
  city: string;
  score: number;
  source: string;
  website: string;
  websiteStatus: "none" | "dead" | "old" | "ok";
  status: LeadStatus;
  notes: string;
  lastUpdated: string;
  websiteQualityTier: WebsiteQualityTier; // column L — set after verification
  enrichedInfo: string; // column M — JSON, set when marked Interesseret
  email: string;        // column N — from scraper or website
  emailSentAt: string;       // kolonne O
  emailOpenedAt: string;     // kolonne P
  emailClickedAt: string;    // kolonne Q
  emailStatus: string;       // kolonne R: "" | "sent" | "opened" | "clicked" | "replied"
  followupSentAt: string;    // kolonne S
  reviewsCount: number;      // kolonne T — review count at scrape time
  callbackDate: string;      // column U — ISO date "YYYY-MM-DD" or ""
  skipReason?: SkipReason;    // kolonne V — set by morning-review skip UI
}

export interface Client {
  id: string;
  name: string;
  branch: string;
  phone: string;
  briefFilled: boolean;
  projectFolder: string;
  websiteStatus: "demo" | "in progress" | "live";
  monthlyFee: string;
  setupFee: string;
}

// Bumped from A2:U to A2:V to include the new skipReason column. Existing
// rows that haven't been touched will just return undefined → "" via the ??
// fallback below, so this is backwards-compatible.
const LEADS_RANGE = "Leads!A2:V";
const CLIENTS_RANGE = "Clients!A2:I";

export async function getLeads(): Promise<Lead[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: LEADS_RANGE,
  });
  const rows = res.data.values ?? [];
  return rows.map((row, i) => ({
    id: String(i + 2),
    name: row[0] ?? "",
    branch: row[1] ?? "",
    phone: row[2] ?? "",
    city: row[3] ?? "",
    score: Number(row[4]) || 0,
    source: row[5] ?? "",
    website: row[6] ?? "",
    websiteStatus: (row[7] as Lead["websiteStatus"]) ?? "none",
    status: (row[8] as LeadStatus) ?? "new",
    notes: row[9] ?? "",
    lastUpdated: row[10] ?? "",
    websiteQualityTier: (row[11] as WebsiteQualityTier) ?? "",
    enrichedInfo: row[12] ?? "",
    email: row[13] ?? "",
    emailSentAt:    row[14] ?? "",
    emailOpenedAt:  row[15] ?? "",
    emailClickedAt: row[16] ?? "",
    emailStatus:    row[17] ?? "",
    followupSentAt: row[18] ?? "",
    reviewsCount:   Number(row[19]) || 0,
    callbackDate:   row[20] ?? "",
    skipReason:     (row[21] as SkipReason) ?? "",
  }));
}

export async function updateLeadStatus(
  rowIndex: number,
  status: LeadStatus,
  notes?: string
): Promise<void> {
  const sheets = getSheetsClient();
  const row = rowIndex + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `Leads!I${row}:K${row}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[status, notes ?? "", new Date().toISOString()]],
    },
  });
}

export async function getClients(): Promise<Client[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: CLIENTS_RANGE,
  });
  const rows = res.data.values ?? [];
  return rows.map((row, i) => ({
    id: String(i + 2),
    name: row[0] ?? "",
    branch: row[1] ?? "",
    phone: row[2] ?? "",
    briefFilled: row[3] === "Yes",
    projectFolder: row[4] ?? "",
    websiteStatus: (row[5] as Client["websiteStatus"]) ?? "demo",
    monthlyFee: row[6] ?? "",
    setupFee: row[7] ?? "",
  }));
}

export async function addClient(lead: Lead): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "Clients!A:I",
    valueInputOption: "RAW",
    requestBody: {
      values: [[lead.name, lead.branch, lead.phone, "No", "", "demo", "", ""]],
    },
  });
}

// Manual add from the Klienter page form (name + a few optional fields).
export async function addClientManual(f: {
  name: string; branch?: string; phone?: string; monthlyFee?: string; setupFee?: string;
}): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "Clients!A:I",
    valueInputOption: "RAW",
    requestBody: {
      values: [[f.name, f.branch ?? "", f.phone ?? "", "No", "", "demo", f.monthlyFee ?? "", f.setupFee ?? ""]],
    },
  });
}

// Remove a client by NAME (robust to row-shift between read + delete). Deletes the
// whole Clients row via deleteDimension. Returns whether a matching row was found.
export async function removeClient(name: string): Promise<{ removed: boolean }> {
  const target = name.trim().toLowerCase();
  if (!target) return { removed: false };
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: CLIENTS_RANGE });
  const rows = res.data.values ?? [];
  const idx = rows.findIndex((r) => (r[0] ?? "").trim().toLowerCase() === target);
  if (idx === -1) return { removed: false };
  const sheetRow = idx + 2; // CLIENTS_RANGE starts at row 2
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: "sheets.properties(sheetId,title)" });
  const sheetId = meta.data.sheets?.find((s) => s.properties?.title === "Clients")?.properties?.sheetId;
  if (sheetId == null) throw new Error("Clients-fanen ikke fundet");
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: sheetRow - 1, endIndex: sheetRow } } }] },
  });
  return { removed: true };
}

// Manual revenue entry. `clientId` is the sheet row number (getClients sets
// id = sheet row), so we write straight to that row's fee columns G (monthly)
// and H (setup). Lucas types these in himself from the Klienter page so the
// CRM knows who actually pays — only rows with monthlyFee>0 count as paying.
export async function updateClientFees(
  clientId: string,
  monthlyFee: string,
  setupFee: string
): Promise<void> {
  const row = parseInt(clientId, 10);
  if (!Number.isFinite(row) || row < 2) throw new Error(`bad client id: ${clientId}`);
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `Clients!G${row}:H${row}`,
    valueInputOption: "RAW",
    requestBody: { values: [[monthlyFee, setupFee]] },
  });
}

export async function updateClientFolder(
  rowIndex: number,
  folderPath: string
): Promise<void> {
  const sheets = getSheetsClient();
  const row = rowIndex + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `Clients!E${row}`,
    valueInputOption: "RAW",
    requestBody: { values: [[folderPath]] },
  });
}

// Website quality bonus added to base score
export function websiteQualityBonus(tier: WebsiteQualityTier, websiteStatus: string): number {
  if (websiteStatus === "none") return 0; // already +30 at scrape time
  if (tier === "dead")     return 25;
  if (tier === "old")      return 20;
  if (tier === "mediocre") return 8;
  if (tier === "modern")   return 0;
  return 0;
}

export async function saveEnrichedInfo(rowIndex: number, info: string): Promise<void> {
  const sheets = getSheetsClient();
  const row = rowIndex + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `Leads!M${row}`,
    valueInputOption: "RAW",
    requestBody: { values: [[info]] },
  });
}

export async function batchUpdateLeadVerifications(
  updates: Array<{ rowIndex: number; qualityTier: WebsiteQualityTier; adjustedScore: number; email?: string }>
): Promise<void> {
  if (updates.length === 0) return;
  const sheets = getSheetsClient();
  const data = updates.flatMap(({ rowIndex, qualityTier, adjustedScore, email }) => {
    const row = rowIndex + 2;
    const entries: { range: string; values: (string | number)[][] }[] = [
      { range: `Leads!E${row}`, values: [[adjustedScore]] },
      { range: `Leads!L${row}`, values: [[qualityTier]] },
    ];
    if (email) entries.push({ range: `Leads!N${row}`, values: [[email]] });
    return entries;
  });
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { valueInputOption: "RAW", data },
  });
}

export async function appendLeads(leads: Omit<Lead, "id">[]): Promise<void> {
  const sheets = getSheetsClient();
  const values = leads.map((l) => [
    l.name,
    l.branch,
    l.phone,
    l.city,
    l.score,
    l.source,
    l.website,
    l.websiteStatus,
    l.status,
    l.notes,
    l.lastUpdated,
    l.websiteQualityTier ?? "",
    l.enrichedInfo ?? "",
    l.email ?? "",
    "", "", "", "", "",       // columns O–S (email tracking — empty at scrape time)
    l.reviewsCount ?? 0,     // column T
    "",                       // column U — callbackDate (empty at scrape time)
    "",                       // column V — skipReason (empty at scrape time)
  ]);
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "Leads!A:A",
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

export async function getLeadNames(): Promise<string[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "Leads!A2:A",
  });
  return (res.data.values ?? []).map((r) => r[0] ?? "");
}

export async function getLeadPhones(): Promise<string[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "Leads!C2:C",
  });
  return (res.data.values ?? []).map((r) => r[0] ?? "").filter(Boolean);
}

export async function saveLeadEmail(rowIndex: number, email: string): Promise<void> {
  const sheets = getSheetsClient();
  const row = rowIndex + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `Leads!N${row}`,
    valueInputOption: "RAW",
    requestBody: { values: [[email]] },
  });
}

export async function batchSaveEmails(updates: Array<{ rowIndex: number; email: string }>): Promise<void> {
  if (updates.length === 0) return;
  const sheets = getSheetsClient();
  const data = updates.map(({ rowIndex, email }) => ({
    range: `Leads!N${rowIndex + 2}`,
    values: [[email]],
  }));
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { valueInputOption: "RAW", data },
  });
}

export async function updateLeadEmailStatus(
  rowIndex: number,
  fields: {
    emailSentAt?: string;
    emailOpenedAt?: string;
    emailClickedAt?: string;
    emailStatus?: string;
    followupSentAt?: string;
  }
): Promise<void> {
  const sheets = getSheetsClient();
  const row = rowIndex + 2;
  const data: { range: string; values: string[][] }[] = [];
  if (fields.emailSentAt    !== undefined) data.push({ range: `Leads!O${row}`, values: [[fields.emailSentAt]] });
  if (fields.emailOpenedAt  !== undefined) data.push({ range: `Leads!P${row}`, values: [[fields.emailOpenedAt]] });
  if (fields.emailClickedAt !== undefined) data.push({ range: `Leads!Q${row}`, values: [[fields.emailClickedAt]] });
  if (fields.emailStatus    !== undefined) data.push({ range: `Leads!R${row}`, values: [[fields.emailStatus]] });
  if (fields.followupSentAt !== undefined) data.push({ range: `Leads!S${row}`, values: [[fields.followupSentAt]] });
  if (data.length === 0) return;
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { valueInputOption: "RAW", data },
  });
}

export async function updateCallbackDate(rowIndex: number, date: string): Promise<void> {
  const sheets = getSheetsClient();
  const row = rowIndex + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `Leads!U${row}`,
    valueInputOption: "RAW",
    requestBody: { values: [[date]] },
  });
}

// Writes to the new column V on the Leads sheet. Used by the morning-review
// UI when Lucas marks a lead as "skip today". The scheduled-send cron checks
// this column (combined with the date it was set) to drop the lead from
// today's send queue.
export async function updateLeadSkipReason(
  rowIndex: number,
  reason: SkipReason
): Promise<void> {
  const sheets = getSheetsClient();
  const row = rowIndex + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `Leads!V${row}`,
    valueInputOption: "RAW",
    requestBody: { values: [[reason]] },
  });
}

// Updates websiteStatus (col H) + websiteQualityTier (col L) in one call.
// Used by pre-cleanup to flip false-positive "dead" leads back to alive.
export async function updateLeadWebsiteStatus(
  rowIndex: number,
  websiteStatus: Lead["websiteStatus"],
  qualityTier: WebsiteQualityTier
): Promise<void> {
  const sheets = getSheetsClient();
  const row = rowIndex + 2;
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `Leads!H${row}`, values: [[websiteStatus]] },
        { range: `Leads!L${row}`, values: [[qualityTier]] },
      ],
    },
  });
}

async function getLeadsSheetId(): Promise<number> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = res.data.sheets?.find((s) => s.properties?.title === "Leads");
  if (sheet?.properties?.sheetId == null) throw new Error("Leads sheet tab not found");
  return sheet.properties.sheetId;
}

// Delete rows by sheet row number (1-based). Must be called with the actual sheet row numbers
// (i.e. lead.id values, which equal sheet row number). Deletes in reverse order to avoid index shift.
// Max deleteDimension requests per batchUpdate call. A mass cleanup can produce
// thousands of rows; coalescing into ranges (planRowDeletionRanges) collapses
// most of that, and this cap chunks whatever ranges remain so a single API call
// never carries an oversized payload or risks a timeout. Chunks run highest-row
// first, so deleting one chunk never shifts an index still queued in a later one.
const DELETE_BATCH_LIMIT = 500;

export async function deleteLeadRows(sheetRowNumbers: number[]): Promise<void> {
  // Dedupe + sort descending + drop header/invalid rows, then coalesce into
  // contiguous ranges (see row-plan.ts) so a batched delete never shifts an
  // index under a queued deletion, double-deletes a neighbour, or removes the
  // header row — and a 5000-row purge becomes a handful of range deletes.
  const ranges = planRowDeletionRanges(sheetRowNumbers);
  if (ranges.length === 0) return;
  const sheetId = await getLeadsSheetId();
  const sheets = getSheetsClient();
  for (let i = 0; i < ranges.length; i += DELETE_BATCH_LIMIT) {
    const chunk = ranges.slice(i, i + DELETE_BATCH_LIMIT);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: chunk.map((r) => ({
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: r.startIndex, // 0-based; covers sheet rows startIndex+1..endIndex
              endIndex: r.endIndex,
            },
          },
        })),
      },
    });
  }
}

// ===== Dead Leads tab =====

const DEAD_LEADS_RANGE = "Dead Leads!A2:V";

async function ensureDeadLeadsTab(): Promise<void> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === "Dead Leads");
  if (exists) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        { addSheet: { properties: { title: "Dead Leads" } } },
      ],
    },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: "Dead Leads!A1:V1",
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        "Name", "Branch", "Phone", "City", "Score", "Source", "Website",
        "WebsiteStatus", "Status", "Notes", "LastUpdated", "WebsiteQualityTier",
        "EnrichedInfo", "Email", "EmailSentAt", "EmailOpenedAt", "EmailClickedAt",
        "EmailStatus", "FollowupSentAt", "ReviewsCount", "CallbackDate", "MovedReason",
      ]],
    },
  });
}

async function appendToDeadLeads(rows: (string | number)[][]): Promise<void> {
  if (rows.length === 0) return;
  await ensureDeadLeadsTab();
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: DEAD_LEADS_RANGE,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });
}

export async function moveLeadsToDeadLeads(
  leads: Lead[],
  reason: string
): Promise<{ moved: number }> {
  if (leads.length === 0) return { moved: 0 };
  const rows = leads.map((l) => [
    l.name, l.branch, l.phone, l.city, l.score, l.source, l.website,
    l.websiteStatus, l.status, l.notes, l.lastUpdated, l.websiteQualityTier,
    l.enrichedInfo, l.email, l.emailSentAt, l.emailOpenedAt, l.emailClickedAt,
    l.emailStatus, l.followupSentAt, l.reviewsCount, l.callbackDate, reason,
  ]);
  await appendToDeadLeads(rows);
  const sheetRows = leads.map((l) => parseInt(l.id, 10)).filter((n) => Number.isFinite(n));
  await deleteLeadRows(sheetRows);
  return { moved: leads.length };
}

// Aggressive cleanup executor (P0.2). Archives `toArchive` into Dead Leads
// (recoverable) and permanently removes both `toArchive` and `toDelete` rows
// from the Leads tab. Index-safe: archived rows are appended FIRST, then all
// removed rows go through deleteLeadRows in a single reverse-sorted batch so no
// row index shifts under another deletion.
export async function purgeAndArchiveLeads(
  toDelete: Lead[],
  toArchive: Lead[],
  archiveReason: string
): Promise<{ deleted: number; archived: number }> {
  if (toArchive.length > 0) {
    const rows = toArchive.map((l) => [
      l.name, l.branch, l.phone, l.city, l.score, l.source, l.website,
      l.websiteStatus, l.status, l.notes, l.lastUpdated, l.websiteQualityTier,
      l.enrichedInfo, l.email, l.emailSentAt, l.emailOpenedAt, l.emailClickedAt,
      l.emailStatus, l.followupSentAt, l.reviewsCount, l.callbackDate, archiveReason,
    ]);
    await appendToDeadLeads(rows);
  }
  const rowNums = [...toDelete, ...toArchive]
    .map((l) => parseInt(l.id, 10))
    .filter((n) => Number.isFinite(n));
  await deleteLeadRows(rowNums); // reverse-sorted internally — safe combined batch
  return { deleted: toDelete.length, archived: toArchive.length };
}

export async function markBriefFilled(rowIndex: number): Promise<void> {
  const sheets = getSheetsClient();
  const row = rowIndex + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `Clients!D${row}`,
    valueInputOption: "RAW",
    requestBody: { values: [["Yes"]] },
  });
}

// ============================================================
// ===== Phase 2: review-pipeline tabs ========================
// ============================================================
//
// Three new tabs, all auto-created on first access via the same pattern as
// ensureDeadLeadsTab():
//
//   • TreatAsAlive  — manually-curated "this site IS alive, don't claim it's
//                     broken" list. Populated automatically when Lucas skips a
//                     lead in the review queue with reason `cloudflare_false_positive`.
//
//   • PauseSchedule — single-row kill switch. If pausedUntil > now, all
//                     cron + manual send routes return early without sending.
//
//   • SkipReasons   — audit log of every skip decision. One row per skip
//                     so we can spot patterns (e.g. "lots of cloudflare
//                     skips on rema-domains → add to TreatAsAlive permanently").

// ----- TreatAsAlive --------------------------------------------------------

const TREAT_AS_ALIVE_TAB = "TreatAsAlive";

async function ensureTreatAsAliveTab(): Promise<void> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === TREAT_AS_ALIVE_TAB);
  if (exists) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{ addSheet: { properties: { title: TREAT_AS_ALIVE_TAB } } }],
    },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TREAT_AS_ALIVE_TAB}!A1:C1`,
    valueInputOption: "RAW",
    requestBody: { values: [["Domain", "Reason", "AddedAt"]] },
  });
}

export async function getTreatAsAliveDomains(): Promise<string[]> {
  await ensureTreatAsAliveTab();
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TREAT_AS_ALIVE_TAB}!A2:A`,
  });
  return (res.data.values ?? [])
    .map((r) => (r[0] ?? "").toString().trim().toLowerCase())
    .filter(Boolean);
}

export async function addTreatAsAliveDomain(domain: string, reason: string): Promise<void> {
  const clean = (domain ?? "").trim().toLowerCase();
  if (!clean) return;
  await ensureTreatAsAliveTab();
  // De-dupe — don't append if the domain is already on the list.
  const existing = await getTreatAsAliveDomains();
  if (existing.includes(clean)) return;
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TREAT_AS_ALIVE_TAB}!A:C`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[clean, reason ?? "", new Date().toISOString()]],
    },
  });
}

// ----- PauseSchedule -------------------------------------------------------
//
// Granular pause schema. Master kill (A2) keeps its existing meaning — fail
// CLOSED on unparseable. Specific-scope cells fail OPEN by default so a
// keyboard slip in column C/D/E cannot freeze the whole system; they DO
// still honour the indefinite-halt sentinels.
//
//   A1 PausedUntil          A2 = master kill timestamp / sentinel / empty
//   B1 SetAt                B2 = master SetAt
//   C1 PausedCold           C2 = cold timestamp / sentinel / empty
//   D1 PausedFollowup       D2
//   E1 PausedManual         E2
//   F1 ColdSetAt            F2
//   G1 FollowupSetAt        G2
//   H1 ManualSetAt          H2

const PAUSE_TAB = "PauseSchedule";

export type PauseScope = "all" | "cold" | "followup" | "manual";

const SCOPE_CELL: Record<PauseScope, { until: string; setAt: string }> = {
  all:      { until: "A2", setAt: "B2" },
  cold:     { until: "C2", setAt: "F2" },
  followup: { until: "D2", setAt: "G2" },
  manual:   { until: "E2", setAt: "H2" },
};

const PAUSE_HEADERS = [
  "PausedUntil", "SetAt", "PausedCold", "PausedFollowup", "PausedManual",
  "ColdSetAt", "FollowupSetAt", "ManualSetAt",
];

async function ensurePauseScheduleTab(): Promise<void> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === PAUSE_TAB);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: PAUSE_TAB } } }],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${PAUSE_TAB}!A1:H2`,
      valueInputOption: "RAW",
      requestBody: {
        values: [PAUSE_HEADERS, ["", "", "", "", "", "", "", ""]],
      },
    });
    return;
  }
  // Idempotent header upgrade — extend an older A1:B2 schema to A1:H2 without
  // touching the master (A2) value or any specific cell that's already set.
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${PAUSE_TAB}!A1:H1`,
  });
  const current = (headerRes.data.values?.[0] ?? []) as string[];
  if (current.length < PAUSE_HEADERS.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${PAUSE_TAB}!A1:H1`,
      valueInputOption: "RAW",
      requestBody: { values: [PAUSE_HEADERS] },
    });
  }
}

export interface PauseStatus {
  paused: boolean;
  until: string | null;
  scope: PauseScope;
  /** True if the master kill (A2) is what's paused us. */
  masterActive: boolean;
  /** True if the specific-scope cell is what's paused us. */
  scopeActive: boolean;
}

const SENTINEL_RE = /^(indefinite|paused|forever|true|stop|halt)$/i;

function classifyCell(value: string, failClosed: boolean): { paused: boolean; raw: string | null } {
  const raw = (value ?? "").toString().trim();
  if (!raw) return { paused: false, raw: null };
  if (SENTINEL_RE.test(raw)) return { paused: true, raw };
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return { paused: failClosed, raw };
  return { paused: parsed > Date.now(), raw };
}

/**
 * Returns the pause status for a given send-scope. Master kill (A2) is
 * always honoured — if it's set, every scope reports paused. Otherwise the
 * scope-specific cell decides.
 *
 * scope === "all" returns the master cell's status verbatim (used by the
 * cron-jobs and any caller that wants to know "is anything paused").
 */
export async function getPauseStatus(scope: PauseScope = "all"): Promise<PauseStatus> {
  await ensurePauseScheduleTab();
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${PAUSE_TAB}!A2:H2`,
  });
  const row = (res.data.values?.[0] ?? []) as string[];
  const master = classifyCell(row[0] ?? "", true);  // A2 — fail CLOSED
  if (scope === "all") {
    return {
      paused: master.paused,
      until: master.raw,
      scope: "all",
      masterActive: master.paused,
      scopeActive: false,
    };
  }
  const colIndex = scope === "cold" ? 2 : scope === "followup" ? 3 : 4;
  const specific = classifyCell(row[colIndex] ?? "", false);  // fail OPEN
  if (master.paused) {
    return { paused: true, until: master.raw, scope, masterActive: true, scopeActive: specific.paused };
  }
  return {
    paused: specific.paused,
    until: specific.raw,
    scope,
    masterActive: false,
    scopeActive: specific.paused,
  };
}

/**
 * Writes the PausedUntil cell for the given scope. Pass empty string to
 * clear. Master (scope="all") writes A2+B2; the others write their own
 * column pair. Master is never touched by a non-"all" scope write.
 */
export async function setPauseUntil(scope: PauseScope, isoDate: string): Promise<void> {
  await ensurePauseScheduleTab();
  const sheets = getSheetsClient();
  const cells = SCOPE_CELL[scope];
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `${PAUSE_TAB}!${cells.until}`, values: [[isoDate]] },
        { range: `${PAUSE_TAB}!${cells.setAt}`, values: [[isoDate ? new Date().toISOString() : ""]] },
      ],
    },
  });
}

/**
 * Read-only snapshot of all four cells in one go. Useful for the review UI
 * which renders all toggles at once.
 */
export interface PauseSnapshot {
  master:   { paused: boolean; until: string | null };
  cold:     { paused: boolean; until: string | null };
  followup: { paused: boolean; until: string | null };
  manual:   { paused: boolean; until: string | null };
}

export async function getPauseSnapshot(): Promise<PauseSnapshot> {
  await ensurePauseScheduleTab();
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${PAUSE_TAB}!A2:H2`,
  });
  const row = (res.data.values?.[0] ?? []) as string[];
  const master = classifyCell(row[0] ?? "", true);
  const cold = classifyCell(row[2] ?? "", false);
  const followup = classifyCell(row[3] ?? "", false);
  const manual = classifyCell(row[4] ?? "", false);
  return {
    master:   { paused: master.paused,   until: master.raw },
    cold:     { paused: cold.paused,     until: cold.raw },
    followup: { paused: followup.paused, until: followup.raw },
    manual:   { paused: manual.paused,   until: manual.raw },
  };
}

// ----- SendQueue -----------------------------------------------------------
//
// Single message-broker tab for outbound mail. Every Vercel send-route
// writes here and never touches Gmail directly. The local send.mjs polls
// this tab, claims pending rows, and sends them with its 4-14 min
// triangular-jitter spacing. This is the only Gmail caller in the system,
// which means the spacing guarantee is enforced in exactly one place.
//
// Schema (A1:L1 header / appended rows):
//   A  id            uuid v4, unique
//   B  enqueuedAt    ISO timestamp of write
//   C  leadId        Leads-sheet row id, "test" for synthetic
//   D  toEmail       recipient address
//   E  kind          "cold" | "followup" | "manual"
//   F  subject       full subject line
//   G  body          plain-text body (already personalised + tracking-pixel free)
//   H  htmlBody      full HTML body (includes tracking pixel)
//   I  status        "pending" | "claimed" | "sent" | "skipped" | "expired"
//   J  claimedAt     ISO when send.mjs took ownership
//   K  sentAt        ISO when Gmail accepted
//   L  skipReason    reason string if status=skipped

const SEND_QUEUE_TAB = "SendQueue";

const SEND_QUEUE_HEADERS = [
  "id", "enqueuedAt", "leadId", "toEmail", "kind",
  "subject", "body", "htmlBody",
  "status", "claimedAt", "sentAt", "skipReason",
];

export type SendQueueKind = "cold" | "followup" | "manual";
export type SendQueueStatus = "pending" | "claimed" | "sent" | "skipped" | "expired";

export interface SendQueueItem {
  id: string;
  enqueuedAt: string;
  leadId: string;
  toEmail: string;
  kind: SendQueueKind;
  subject: string;
  body: string;
  htmlBody: string;
  status: SendQueueStatus;
  claimedAt: string;
  sentAt: string;
  skipReason: string;
  /** Row index in the sheet (0-based starting after header) — needed for in-place updates. */
  rowIndex: number;
}

async function ensureSendQueueTab(): Promise<void> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === SEND_QUEUE_TAB);
  if (exists) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{ addSheet: { properties: { title: SEND_QUEUE_TAB } } }],
    },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SEND_QUEUE_TAB}!A1:L1`,
    valueInputOption: "RAW",
    requestBody: { values: [SEND_QUEUE_HEADERS] },
  });
}

function uuidv4(): string {
  // Built-in if available (Node 19+ and modern browsers), else fallback.
  if (typeof crypto !== "undefined" && typeof (crypto as { randomUUID?: () => string }).randomUUID === "function") {
    return (crypto as { randomUUID: () => string }).randomUUID();
  }
  // Fallback — RFC4122 v4-like; good enough for queue ids.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface EnqueueSendInput {
  leadId: string;            // Leads row id ("test" for synthetic)
  toEmail: string;
  kind: SendQueueKind;
  subject: string;
  body: string;
  htmlBody: string;
}

/**
 * Append a pending item to SendQueue. Returns the generated id.
 *
 * This is the only path by which Vercel-side code "sends" mail —
 * actual Gmail dispatch happens later, in send.mjs, with the
 * triangular 4-14 min spacing. The function never blocks for Gmail.
 */
export async function enqueueSend(item: EnqueueSendInput): Promise<string> {
  await ensureSendQueueTab();
  const sheets = getSheetsClient();
  const id = uuidv4();
  const now = new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SEND_QUEUE_TAB}!A:L`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        id, now, item.leadId, item.toEmail, item.kind,
        item.subject, item.body, item.htmlBody,
        "pending", "", "", "",
      ]],
    },
  });
  return id;
}

/**
 * Fetch all rows currently in the SendQueue tab (including completed ones —
 * filter on .status as needed). Each row carries its sheet rowIndex so the
 * caller can issue in-place status updates.
 */
export async function getSendQueueRows(): Promise<SendQueueItem[]> {
  await ensureSendQueueTab();
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SEND_QUEUE_TAB}!A2:L`,
  });
  const rows = (res.data.values ?? []) as string[][];
  return rows.map((row, i) => ({
    id:         row[0] ?? "",
    enqueuedAt: row[1] ?? "",
    leadId:     row[2] ?? "",
    toEmail:    row[3] ?? "",
    kind:       (row[4] ?? "cold") as SendQueueKind,
    subject:    row[5] ?? "",
    body:       row[6] ?? "",
    htmlBody:   row[7] ?? "",
    status:     (row[8] ?? "pending") as SendQueueStatus,
    claimedAt:  row[9] ?? "",
    sentAt:     row[10] ?? "",
    skipReason: row[11] ?? "",
    rowIndex:   i,
  }));
}

/**
 * Convenience helper for send.mjs: just the rows still waiting.
 */
export async function getPendingSendQueue(): Promise<SendQueueItem[]> {
  const all = await getSendQueueRows();
  return all.filter((r) => r.status === "pending");
}

interface SendQueueUpdate {
  status: SendQueueStatus;
  claimedAt?: string;
  sentAt?: string;
  skipReason?: string;
}

/**
 * Update a SendQueue row's status (and timestamps / reason). Uses the
 * sheet-row offset from getSendQueueRows. Pass only the fields you want to
 * change.
 */
export async function markSendQueueItem(rowIndex: number, update: SendQueueUpdate): Promise<void> {
  await ensureSendQueueTab();
  const sheets = getSheetsClient();
  const row = rowIndex + 2; // skip header
  const data: { range: string; values: string[][] }[] = [
    { range: `${SEND_QUEUE_TAB}!I${row}`, values: [[update.status]] },
  ];
  if (update.claimedAt !== undefined) data.push({ range: `${SEND_QUEUE_TAB}!J${row}`, values: [[update.claimedAt]] });
  if (update.sentAt !== undefined)    data.push({ range: `${SEND_QUEUE_TAB}!K${row}`, values: [[update.sentAt]] });
  if (update.skipReason !== undefined) data.push({ range: `${SEND_QUEUE_TAB}!L${row}`, values: [[update.skipReason]] });
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { valueInputOption: "RAW", data },
  });
}

// ----- SkipReasons ---------------------------------------------------------

const SKIP_REASONS_TAB = "SkipReasons";

async function ensureSkipReasonsTab(): Promise<void> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === SKIP_REASONS_TAB);
  if (exists) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{ addSheet: { properties: { title: SKIP_REASONS_TAB } } }],
    },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SKIP_REASONS_TAB}!A1:D1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[ "Timestamp", "LeadId", "Reason", "Notes" ]],
    },
  });
}

export async function logSkipReason(
  leadId: string,
  reason: SkipReason | string,
  notes?: string
): Promise<void> {
  await ensureSkipReasonsTab();
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SKIP_REASONS_TAB}!A:D`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        new Date().toISOString(),
        leadId,
        reason,
        notes ?? "",
      ]],
    },
  });
}
