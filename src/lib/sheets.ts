import { google } from "googleapis";

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

export type LeadStatus = "new" | "called" | "interested" | "client" | "skip";
export type WebsiteQualityTier = "modern" | "mediocre" | "old" | "dead" | "";

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

const LEADS_RANGE = "Leads!A2:U";
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

async function getLeadsSheetId(): Promise<number> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = res.data.sheets?.find((s) => s.properties?.title === "Leads");
  if (sheet?.properties?.sheetId == null) throw new Error("Leads sheet tab not found");
  return sheet.properties.sheetId;
}

// Delete rows by sheet row number (1-based). Must be called with the actual sheet row numbers
// (i.e. lead.id values, which equal sheet row number). Deletes in reverse order to avoid index shift.
export async function deleteLeadRows(sheetRowNumbers: number[]): Promise<void> {
  if (sheetRowNumbers.length === 0) return;
  const sheetId = await getLeadsSheetId();
  const sheets = getSheetsClient();
  const sorted = [...sheetRowNumbers].sort((a, b) => b - a);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: sorted.map((row) => ({
        deleteDimension: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: row - 1, // row is 1-based sheet row; startIndex is 0-based
            endIndex: row,
          },
        },
      })),
    },
  });
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
