import PageHeader from "@/components/shell/PageHeader";
import VaultBrowser from "@/components/vault/VaultBrowser";
import { listVault, vaultStatus } from "@/lib/vault";

export const metadata = { title: "Memory · Command Center" };
export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const { source, entries } = await listVault("");
  const status = vaultStatus();

  return (
    <div className="cc-fade">
      <PageHeader
        icon="Brain"
        title="Memory"
        subtitle={`Second brain — KnowledgeOS. ${status.hasLocal ? "Lokal mirror aktiv." : "Læser fra GitHub."}`}
      />
      <VaultBrowser
        entries={entries}
        source={source}
        emptyHint={`Læg noter i KnowledgeOS/ (lokalt) eller giv adgang til ${status.repo}. Design-templates og roadmap ligger allerede her.`}
      />
    </div>
  );
}
