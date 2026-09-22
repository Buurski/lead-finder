// Kundeviden fra vaulten (wiki/kunder) til kunde-mappen. Læser kun de noter,
// der matcher kundens navn — aldrig hele mappen.
import "server-only";
import { listVault, readVaultNote } from "../vault.ts";
import { noteMatches, type DossierNote } from "./dossier.ts";

const MAX_NOTES = 6;
const MAX_BODY = 4000;

export async function loadCustomerNotes(companyName: string): Promise<DossierNote[]> {
  const { entries } = await listVault("wiki/kunder", { preferRemote: true });
  const hits = entries.filter((e) => e.pathRel.endsWith(".md") && noteMatches(companyName, e.pathRel)).slice(0, MAX_NOTES);
  const notes = await Promise.all(hits.map((e) => readVaultNote(e.pathRel, { preferRemote: true })));
  return notes
    .filter((n) => n.ok)
    .map((n) => ({
      path: n.pathRel,
      title: n.frontmatter.title || n.pathRel.split("/").pop()!.replace(/\.md$/, ""),
      body: n.body.length > MAX_BODY ? n.body.slice(0, MAX_BODY) + "\n…" : n.body,
      crmId: n.frontmatter.crm_id || undefined,
    }));
}
