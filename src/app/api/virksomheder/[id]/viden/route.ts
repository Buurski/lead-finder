import { getDb } from "@/lib/db/client";
import { generate } from "@/lib/ai";
import { HqInputError, hqWrite, jsonBody, uuid } from "@/lib/hq/api";
import { dossierText, getDossier } from "@/lib/hq/dossier";
import { loadCustomerNotes } from "@/lib/hq/notes";
import { cleanModelNote, kbPathFor, knowledgePrompt, lineDiff, validKbPath, validNoteContent } from "@/lib/hq/knowledge";
import { readVaultNote, writeVaultNote } from "@/lib/vault";
import { activity } from "@/lib/db/schema";

export const runtime = "nodejs";
export const maxDuration = 90;

// POST {action:"forslag", path?} → AI-forslag + diff (skriver intet).
// POST {action:"gem", path, content} → commit til vaulten (kun wiki/kunder/*.md).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return hqWrite(req, async (actor) => {
    const id = uuid((await ctx.params).id, "virksomheds-id");
    const body = await jsonBody(req);
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    const d = await getDossier(db, id, { today, loadNotes: loadCustomerNotes });
    if (!d) throw new HqInputError("virksomheden findes ikke");
    const known = d.notes.map((n) => n.path);

    if (body.action === "gem") {
      if (!validKbPath(body.path)) throw new HqInputError("ugyldig sti til kundenote");
      if (!known.includes(body.path) && body.path !== kbPathFor(d.company.name)) throw new HqInputError("noten hører ikke til denne virksomhed");
      if (!validNoteContent(body.content)) throw new HqInputError("noten er tom eller for lang");
      const res = await writeVaultNote(body.path, body.content, `crm: opdatér kundenote ${d.company.name} (${actor})`);
      if (!res.ok) throw new HqInputError(res.reason ?? "kunne ikke gemme i vaulten");
      await db.insert(activity).values({ companyId: id, clientName: d.company.name, actor, type: "note", summary: `Kundenoten er opdateret i vaulten (${body.path})` });
      return { ok: true, path: body.path };
    }

    if (body.action !== "forslag") throw new HqInputError("ukendt handling");
    const path = validKbPath(body.path) && known.includes(body.path) ? body.path : (known[0] ?? kbPathFor(d.company.name));
    const note = known.includes(path) ? await readVaultNote(path, { preferRemote: true }) : null;
    const before = note?.ok ? note.raw : "";
    const { system, prompt } = knowledgePrompt({ companyName: d.company.name, crm: dossierText(d, 10_000), current: before || null, today });
    const out = await generate({ task: "research", prompt, system, maxTokens: 2500, timeoutMs: 75_000 });
    if (!out?.text) throw new HqInputError("AI svarede ikke — prøv igen om lidt");
    const after = cleanModelNote(out.text);
    return { path, paths: known, isNew: !before, before, after, diff: lineDiff(before, after) };
  });
}
