// datalayer.ts — the bridge that keeps the approval queue (.send_queue) and the
// Google Sheets database in sync (brief QUALITY phase: "ét datalag").
//
// The engine writes drafts to .send_queue/approval_queue.json keyed by leadId
// (the lead's Sheets ROW number). When a draft is approved / sent, or a reply
// turns a lead into a client, that outcome must be written BACK to Sheets —
// otherwise a won deal (like VIDA) never registers in the CRM.
//
// sheets.ts is imported LAZILY so this module (and its pure helpers) can be
// loaded by the plain-node engine without dragging in googleapis, and so a
// missing creds / offline situation degrades to {ok:false} instead of throwing.

import type { QueueDraft } from "./queue.ts";
import type { ReplyClassification } from "./reply.ts";

export interface SyncResult {
  ok: boolean;
  action: string;
  leadId: string;
  rowIndex?: number;
  error?: string;
}

// A queue draft's leadId is the lead's Sheets row number (engine sets id=i+2).
// sheets.ts mutators take rowIndex = sheetRow - 2. Returns null for the fixture
// / write-to-x drafts that have no real Sheets row.
export function rowIndexFromLeadId(leadId: string): number | null {
  if (!leadId || !/^\d+$/.test(leadId)) return null;
  const row = parseInt(leadId, 10);
  if (row < 2) return null;
  return row - 2;
}

async function sheets() {
  return import("./sheets.ts");
}

// Mark a sent draft on the lead row (column O/R). Status "sent" mirrors the
// existing bulk-send bookkeeping so the two paths converge on one schema.
export async function registerDraftSent(draft: QueueDraft): Promise<SyncResult> {
  const rowIndex = rowIndexFromLeadId(draft.leadId);
  if (rowIndex == null) return { ok: false, action: "sent", leadId: draft.leadId, error: "no-sheets-row" };
  try {
    const { updateLeadEmailStatus } = await sheets();
    await updateLeadEmailStatus(rowIndex, { emailSentAt: new Date().toISOString(), emailStatus: "sent" });
    return { ok: true, action: "sent", leadId: draft.leadId, rowIndex };
  } catch (e) {
    return { ok: false, action: "sent", leadId: draft.leadId, rowIndex, error: String(e) };
  }
}

// Approving (not yet sending) a draft moves the lead to "interested" so it
// leaves the "new" pool the engine PICKs from — no duplicate drafting.
export async function registerDraftApproved(draft: QueueDraft): Promise<SyncResult> {
  const rowIndex = rowIndexFromLeadId(draft.leadId);
  if (rowIndex == null) return { ok: false, action: "approved", leadId: draft.leadId, error: "no-sheets-row" };
  try {
    const { updateLeadStatus } = await sheets();
    await updateLeadStatus(rowIndex, "interested", "draft approved in /approve");
    return { ok: true, action: "approved", leadId: draft.leadId, rowIndex };
  } catch (e) {
    return { ok: false, action: "approved", leadId: draft.leadId, rowIndex, error: String(e) };
  }
}

// Lucas fortrød en godkendelse (fx "No Scandinavia" 2026-06-11): vi fjerner
// drafted-status og markerer lead'en som "skip" så engine'en aldrig re-picker
// den. Kombineret med queue.ts's 14-dages reject-blok skaber det varig
// beskyttelse — selv hvis Sheets-skiftet fejler, blokker queue-laget i 2 uger.
export async function unregisterDraftApproved(draft: QueueDraft): Promise<SyncResult> {
  const rowIndex = rowIndexFromLeadId(draft.leadId);
  if (rowIndex == null) return { ok: false, action: "unapproved", leadId: draft.leadId, error: "no-sheets-row" };
  try {
    const { updateLeadStatus } = await sheets();
    await updateLeadStatus(rowIndex, "skip", "draft unapproved in /approve");
    return { ok: true, action: "unapproved", leadId: draft.leadId, rowIndex };
  } catch (e) {
    return { ok: false, action: "unapproved", leadId: draft.leadId, rowIndex, error: String(e) };
  }
}

// Register the outcome of an inbound reply. This is the VIDA fix: an explicit
// yes flips the lead to "client"; a hard stop flips it to "skip"; interest
// moves it to "interested". Everything else is left untouched.
export async function registerReplyOutcome(
  leadId: string,
  classification: ReplyClassification
): Promise<SyncResult> {
  const rowIndex = rowIndexFromLeadId(leadId);
  if (rowIndex == null) return { ok: false, action: "reply", leadId, error: "no-sheets-row" };
  const status = classification.becameClient
    ? "client"
    : classification.shouldStop
      ? "skip"
      : classification.isInterested
        ? "interested"
        : null;
  if (!status) return { ok: false, action: "reply", leadId, rowIndex, error: "no-status-change" };
  try {
    const { updateLeadStatus } = await sheets();
    await updateLeadStatus(rowIndex, status, `reply: ${classification.category}`);
    return { ok: true, action: `reply->${status}`, leadId, rowIndex };
  } catch (e) {
    return { ok: false, action: "reply", leadId, rowIndex, error: String(e) };
  }
}
