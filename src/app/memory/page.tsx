import PageHeader from "@/components/shell/PageHeader";
import VaultBrowser from "@/components/vault/VaultBrowser";
import { listVault, vaultStatus, vaultLiveCheck } from "@/lib/vault";

export const metadata = { title: "Memory · Command Center" };
export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const [{ source, entries }, status, live] = await Promise.all([
    listVault(""),
    Promise.resolve(vaultStatus()),
    vaultLiveCheck(),
  ]);

  const badge = live.live
    ? { label: "Vault: live", dot: "var(--accent)" }
    : live.reason === "no-token"
      ? { label: "Vault: lokal seed", dot: "var(--border-strong)" }
      : { label: `Vault: ${live.reason}`, dot: "var(--amber)" };

  return (
    <div className="cc-fade">
      <PageHeader
        icon="Brain"
        title="Memory"
        subtitle={`Second brain — KnowledgeOS. ${live.detail}`}
        action={
          <span className="cc-chip" title={live.detail}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: badge.dot, display: "inline-block" }} />
            {badge.label}
          </span>
        }
      />
      <VaultBrowser
        entries={entries}
        source={source}
        emptyHint={`Læg noter i KnowledgeOS/ (lokalt) eller giv adgang til ${status.repo}. Design-templates og roadmap ligger allerede her.`}
      />
    </div>
  );
}
