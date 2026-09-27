// idea-cleanup.ts — Hermes' forslag til at rydde op i blog-idéerne (blog_ide_oprydning.py,
// hver 2. uge). Kun FORSLAG: Lucas sletter eller beholder på /blog. To JSON-dokumenter
// i store.ts (ingen tabel): det seneste forslag (overskrives hver kørsel) og listen over
// idéer Lucas har valgt at beholde (overlever kørslerne, så samme forslag ikke kommer igen).
import { store } from "../store.ts";
import { CompetitorInputError, enumOf, isoDate, noUnknownKeys, obj, str } from "./competitors.ts";

const KEY = "blog/idea-cleanup/latest";
const KEY_KEPT = "blog/idea-cleanup/kept";

export const IDEA_CLEANUP_KINDS = ["overlap", "svag", "for-mange"] as const;
export interface IdeaSuggestion { id: string; title: string; kind: (typeof IDEA_CLEANUP_KINDS)[number]; reason: string; overlapWith?: string }
export interface IdeaCleanup { checkedAt: string; ideas: number; suggestions: IdeaSuggestion[] }

export function validateIdeaCleanup(raw: Record<string, unknown>): IdeaCleanup {
  noUnknownKeys(raw, ["action", "checkedAt", "ideas", "suggestions"], "body");
  if (!Array.isArray(raw.suggestions)) throw new CompetitorInputError("suggestions skal være en liste");
  const ideas = raw.ideas;
  if (typeof ideas !== "number" || !Number.isInteger(ideas) || ideas < 0) throw new CompetitorInputError("ideas skal være et helt tal");
  return {
    checkedAt: isoDate(raw.checkedAt, "checkedAt"),
    ideas,
    suggestions: raw.suggestions.slice(0, 40).map((v, i) => {
      const label = `suggestions[${i}]`;
      const o = obj(v, label);
      noUnknownKeys(o, ["id", "title", "kind", "reason", "overlapWith"], label);
      const overlapWith = str(o.overlapWith, `${label}.overlapWith`, 200);
      return {
        id: str(o.id, `${label}.id`, 60, true)!,
        title: str(o.title, `${label}.title`, 200, true)!,
        kind: enumOf(o.kind, `${label}.kind`, IDEA_CLEANUP_KINDS, true)!,
        reason: str(o.reason, `${label}.reason`, 300, true)!,
        ...(overlapWith ? { overlapWith } : {}),
      };
    }),
  };
}

export async function saveIdeaCleanup(raw: Record<string, unknown>): Promise<IdeaCleanup> {
  const doc = validateIdeaCleanup(raw);
  await store.put(KEY, doc);
  return doc;
}

/** "Behold": idéen foreslås ikke igen. */
export async function keepIdea(id: string): Promise<void> {
  const kept = (await store.get<string[]>(KEY_KEPT)) ?? [];
  if (!kept.includes(id)) await store.put(KEY_KEPT, [...kept, id].slice(-300));
}

/** Åbne forslag: kun kort der stadig ligger i Idéer, og ikke beholdt. */
export async function openIdeaCleanup(ideaIds: Set<string>): Promise<{ checkedAt: string | null; suggestions: IdeaSuggestion[] }> {
  const doc = await store.get<IdeaCleanup>(KEY);
  const kept = new Set((await store.get<string[]>(KEY_KEPT)) ?? []);
  return { checkedAt: doc?.checkedAt ?? null, suggestions: (doc?.suggestions ?? []).filter((s) => ideaIds.has(s.id) && !kept.has(s.id)) };
}
