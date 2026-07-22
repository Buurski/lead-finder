import { hermesHealth, hermesCronList } from "@/lib/hermes";
import { listVault, readVaultNote } from "@/lib/vault";
import HermesClient from "./HermesClient";

export const metadata = { title: "Hermes · AgenticOS" };
export const dynamic = "force-dynamic";

const WEBUI_URL = "https://number-producers-investigations-galleries.trycloudflare.com";

async function latestDream(): Promise<{ path: string; body: string } | null> {
  try {
    const { entries } = await listVault("daily", { preferRemote: true });
    const dreams = entries
      .map((e) => e.pathRel)
      .filter((p) => /daily\/\d{4}-\d{2}-\d{2}-[^/]+\.md$/.test(p))
      .sort()
      .reverse();
    if (!dreams.length) return null;
    const note = await readVaultNote(dreams[0], { preferRemote: true });
    if (!note?.body) return null;
    return { path: dreams[0], body: note.body };
  } catch (err) {
    console.error("hermes: latestDream fejlede", err);
    return null;
  }
}

export default async function HermesPage() {
  const [health, jobs, dream] = await Promise.all([hermesHealth(), hermesCronList(), latestDream()]);

  return (
    <div data-hermes-page style={{ margin: "-24px -28px -32px", minHeight: "calc(100vh - 32px)" }}>
      <HermesClient
        initialHealth={health}
        initialJobs={jobs}
        dream={dream}
        webuiUrl={WEBUI_URL}
      />
    </div>
  );
}