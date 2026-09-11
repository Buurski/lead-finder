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
