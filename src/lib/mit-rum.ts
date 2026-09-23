// mit-rum.ts — private noter pr. bruger. Egen KV-nøgle pr. person, så Lucas og
// Charlie aldrig kan se (eller slette) hinandens noter. Ren lib uden adgang til
// requesten: ruterne udleder brugeren af currentUser() og sender den ind.
import { store } from "./store.ts";

export interface PrivateNote {
  id: string;
  text: string;
  ts: string;
}

export const notesKey = (user: string) => `private/u/${user}/notes`;

const MAX_LEN = 2000;

export async function listNotes(user: string): Promise<PrivateNote[]> {
  const all = (await store.get<PrivateNote[]>(notesKey(user))) ?? [];
  return [...all].sort((a, b) => (a.ts < b.ts ? 1 : -1));
}

export async function addNote(user: string, text: string): Promise<PrivateNote> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("noten er tom");
  if (trimmed.length > MAX_LEN) throw new Error(`noten er over ${MAX_LEN} tegn`);
  const note: PrivateNote = {
    id: crypto.randomUUID().replace(/-/g, "").slice(0, 16),
    text: trimmed,
    ts: new Date().toISOString(),
  };
  const all = (await store.get<PrivateNote[]>(notesKey(user))) ?? [];
  await store.put(notesKey(user), [...all, note]);
  return note;
}

/** Sletter KUN hvis noten findes i DEN brugerens liste. */
export async function deleteNote(user: string, id: string): Promise<boolean> {
  const all = (await store.get<PrivateNote[]>(notesKey(user))) ?? [];
  const kept = all.filter((n) => n.id !== id);
  if (kept.length === all.length) return false;
  await store.put(notesKey(user), kept);
  return true;
}
