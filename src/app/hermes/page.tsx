import PageHeader from "@/components/shell/PageHeader";
import { hermesHealth, hermesCronList } from "@/lib/hermes";
import { listVault, readVaultNote } from "@/lib/vault";
import HermesClient from "./HermesClient";

export const metadata = { title: "Hermes · Command Center" };
export const dynamic = "force-dynamic";

const WEBUI_URL = "https://number-producers-investigations-galleries.trycloudflare.com";

// Latest dream note from the live vault (Hermes writes daily/<date>-dream.md
// on the VPS clone and pushes; we read remote-first like the journal does).
async function latestDream(): Promise<{ path: string; body: string } | null> {
  try {
    const { entries } = await listVault("daily", { preferRemote: true });
    // Hermes names night-run files daily/<date>-<suffix>.md (fx -dream,
    // -lead-analyse). Plain daily/<date>.md is the morning brief — skip it.
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

  const statusLabel = !health.configured
    ? "ikke konfigureret"
    : health.reachable
      ? "online"
      : "offline";
  const statusOn = health.configured && health.reachable;

  return (
    <div className="cc-fade">
      <PageHeader
        icon="Radio"
        title="Hermes"
        subtitle="Buur Agent — jeres 24/7 medstifter på VPS'en."
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span
              className="cc-chip"
              style={{
                background: statusOn ? "var(--accent-soft)" : "var(--bg-3)",
                color: statusOn ? "var(--accent-ink)" : "var(--text-muted)",
              }}
            >
              <span
                className={statusOn ? "hermes-live-dot" : undefined}
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: statusOn ? "var(--accent)" : "var(--border-strong)",
                  display: "inline-block",
                  marginRight: 6,
                }}
              />
              {statusLabel}
            </span>
            <a
              href={WEBUI_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="cc-chip"
              style={{
                background: "var(--bg-3)",
                color: "var(--text-muted)",
                textDecoration: "none",
                fontSize: 12,
              }}
              title="Åbn fulde Hermes WebUI i nyt vindue (cloudflare-tunnel)"
            >
              Hermes WebUI ↗
            </a>
          </div>
        }
      />
      <HermesClient
        initialHealth={health}
        initialJobs={jobs}
        dream={dream}
      />
    </div>
  );
}