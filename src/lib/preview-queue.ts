import { store } from "./store.ts";

export const PREVIEW_STATUSES = [
  "ny",
  "researcher",
  "bygger",
  "preview klar",
  "godkendt",
  "kladde klar",
  "afvist",
  "sendt/lukket",
] as const;
export type PreviewStatus = (typeof PREVIEW_STATUSES)[number];
export type PreviewChannel = "formular" | "mail";

export interface PreviewRequestInput {
  company: string;
  channel: PreviewChannel;
  email: string;
  website?: string;
  contactName?: string;
  branch?: string;
  questionnaire?: string;
  sourceMessageId?: string;
  demoKey?: string;
}

export interface PreviewRequest extends PreviewRequestInput {
  id: string;
  status: PreviewStatus;
  noindex: true;
  createdAt: string;
  updatedAt: string;
  research?: string;
  previewUrl?: string;
  screenshotUrl?: string;
  mailDraft?: string;
  approvedAt?: string;
  rejectedAt?: string;
}

const KEY = "preview-requests";

function id(): string {
  return `preview_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function demoKey(): string {
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

export async function readPreviewRequests(): Promise<PreviewRequest[]> {
  const value = await store.get<PreviewRequest[]>(KEY);
  return Array.isArray(value) ? value : [];
}

export async function createPreviewRequest(input: PreviewRequestInput): Promise<PreviewRequest> {
  const company = input.company.trim();
  const email = input.email.trim().toLowerCase();
  if (!company || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("company og gyldig email er påkrævet");
  }
  const now = new Date().toISOString();
  const record: PreviewRequest = {
    id: id(),
    company,
    channel: input.channel,
    email,
    website: input.website?.trim() || undefined,
    contactName: input.contactName?.trim() || undefined,
    branch: input.branch?.trim() || undefined,
    questionnaire: input.questionnaire?.trim() || undefined,
    sourceMessageId: input.sourceMessageId?.trim() || undefined,
    demoKey: input.demoKey?.trim() || demoKey(),
    status: "ny",
    noindex: true,
    createdAt: now,
    updatedAt: now,
  };
  const records = await readPreviewRequests();
  await store.put(KEY, [...records, record]);
  return record;
}

export async function updatePreviewStatus(
  requestId: string,
  status: PreviewStatus,
  fields: Partial<Pick<PreviewRequest, "research" | "previewUrl" | "screenshotUrl" | "mailDraft" | "contactName" | "branch" | "questionnaire" | "company" | "demoKey">> = {},
): Promise<PreviewRequest | null> {
  const records = await readPreviewRequests();
  const index = records.findIndex((item) => item.id === requestId);
  if (index < 0) return null;
  const current = records[index];
  const definedFields = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as Partial<Pick<PreviewRequest, "research" | "previewUrl" | "screenshotUrl" | "mailDraft" | "contactName" | "branch" | "questionnaire" | "company" | "demoKey">>;
  const next: PreviewRequest = {
    ...current,
    ...definedFields,
    status,
    ...(status === "godkendt" ? { approvedAt: new Date().toISOString() } : {}),
    ...(status === "afvist" ? { rejectedAt: new Date().toISOString() } : {}),
    updatedAt: new Date().toISOString(),
  };
  records[index] = next;
  await store.put(KEY, records);
  return next;
}
