import fs from "node:fs";
import path from "node:path";
import PageHeader from "@/components/shell/PageHeader";
import MarkdownLite from "@/components/shell/MarkdownLite";

export const metadata = { title: "Plan-historik · Command Center" };
export const dynamic = "force-dynamic";

const DOCS = [
  { file: "DASHBOARD_OVERHAUL_GOAL.md", label: "Dashboard Overhaul — byg-kontrakt" },
  { file: "COMMAND_CENTER_VISION.md", label: "Command Center — vision" },
  { file: "PLAN_DAGENS.md", label: "Del 2 — dagsplan (12 blocks)" },
  { file: "PLAN_DEL3.md", label: "Del 3 — dagsplan (12 blocks)" },
  { file: "NIGHT_BUILD_REPORT.md", label: "Nat-rapport v1" },
  { file: "NIGHT_BUILD_REPORT_v2.md", label: "Nat-rapport v2" },
  { file: "NIGHT_BUILD_REPORT_v3.md", label: "Nat-rapport v3 (Del 3)" },
];

function readDoc(file: string): string | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), file), "utf-8");
  } catch {
    return null;
  }
}

export default function BuildGuidePage() {
  const docs = DOCS.map((d) => ({ ...d, body: readDoc(d.file) }));
  return (
    <div className="cc-fade">
      <PageHeader
        icon="Map"
        title="Plan-historik"
        subtitle="Planerne bag command center'et og nat-rapporterne, fase for fase."
      />
      <div style={{ display: "grid", gap: 18 }}>
        {docs.map((d) => (
          <section key={d.file} className="cc-card cc-card-pad">
            <div className="cc-kicker" style={{ marginBottom: 8 }}>{d.file}</div>
            {d.body ? (
              <MarkdownLite source={d.body} />
            ) : (
              <p className="cc-dim" style={{ fontSize: 13 }}>Kunne ikke læse {d.file}.</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
