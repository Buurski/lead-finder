// sms/state.ts — which SMS leads Lucas has handled (texted / skipped), so the same
// number never resurfaces. KV-backed, mirrors the Messenger state. Strip-safe.

import { store } from "../store.ts";

const KEY = "sms/state";

export interface SmsState {
  sent: Record<string, string>;    // leadId → ISO timestamp
  skipped: Record<string, string>;
}

export async function loadSmsState(): Promise<SmsState> {
  try {
    const s = await store.get<SmsState>(KEY);
    return { sent: s?.sent ?? {}, skipped: s?.skipped ?? {} };
  } catch {
    return { sent: {}, skipped: {} };
  }
}

export async function markSms(id: string, action: "sent" | "skipped"): Promise<void> {
  const s = await loadSmsState();
  s[action][id] = new Date().toISOString();
  await store.put(KEY, s);
}

export function handledIds(s: SmsState): Set<string> {
  return new Set([...Object.keys(s.sent), ...Object.keys(s.skipped)]);
}
