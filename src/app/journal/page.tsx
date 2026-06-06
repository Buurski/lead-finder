import PageHeader from "@/components/shell/PageHeader";
import VaultBrowser from "@/components/vault/VaultBrowser";
import { listVault } from "@/lib/vault";

export const metadata = { title: "Journal · Command Center" };
export const dynamic = "force-dynamic";

export default async function JournalPage() {
  // Remote-first: read the live Obsidian vault (pushed each morning), not the
  // stale in-repo mirror that would otherwise shadow today's note.
  const { source, entries } = await listVault("daily", { preferRemote: true });
  // newest first by filename (daily notes are date-named)
  const sorted = [...entries].sort((a, b) => b.pathRel.localeCompare(a.pathRel));

  return (
    <div className="cc-fade">
      <PageHeader
        icon="BookOpen"
        title="Journal"
        subtitle="Daglige briefs og logs — den rolige version af 'hvad skete der / hvad nu'."
      />
      <VaultBrowser
        entries={sorted}
        source={source}
        groupByDir={false}
        emptyHint="Morgen-briefen skriver til KnowledgeOS/daily/. Læg en note der, så dukker den op her."
      />
    </div>
  );
}
