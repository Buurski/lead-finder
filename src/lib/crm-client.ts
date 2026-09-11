export const ACTIVITY_TYPES = ["note", "call", "email", "meeting", "task", "invoice", "status"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface CrmContact {
  id: string;
  clientName: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  channel: string;
  note: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface CrmActivity {
  id: string;
  clientName: string;
  at: string;
  type: ActivityType;
  text: string;
  actor: string;
}

export interface CrmTask {
  id: string;
  clientName: string;
  title: string;
  due: string;
  done: boolean;
  at: string;
  doneAt?: string;
  deletedAt?: string;
}

/** Åbneste opgave med tidligste frist — forfaldne først, opgaver uden frist sidst. */
export function mostUrgentOpenTask(tasks: CrmTask[]): CrmTask | undefined {
  return tasks
    .filter((task) => !task.done)
    .sort((a, b) => (a.due || "9999-99-99").localeCompare(b.due || "9999-99-99"))[0];
}

/** Kastet når CRM-lageret reelt er nede (netværksfejl eller 5xx) — UI'et skal så låse. */
export class CrmStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrmStoreError";
  }
}

/** Fælles fetch for CRM-mutationer: skelner "lageret svarer ikke" fra almindelige valideringsfejl. */
export async function crmRequest<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new CrmStoreError("CRM-lageret svarer ikke — intet blev gemt");
  }
  const data = (await response.json().catch(() => ({}))) as { error?: unknown };
  if (!response.ok) {
    const message = typeof data.error === "string" && data.error ? data.error : "handlingen fejlede";
    if (response.status >= 500) throw new CrmStoreError(`CRM-lageret fejlede — ${message}`);
    throw new Error(message);
  }
  return data as T;
}
