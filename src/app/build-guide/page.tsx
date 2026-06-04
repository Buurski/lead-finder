import fs from "node:fs";
import path from "node:path";
import PageHeader from "@/components/shell/PageHeader";
import MarkdownLite from "@/components/shell/MarkdownLite";

export const metadata = { title: "Build Guide · Command Center" };
export const dynamic = "force-dynamic";

const DOCS = [
  { file: "DASHBOARD_OVERHAUL_GOAL.md", label: "Dashboard Overhaul — byg-kontrakt" },
  { file: "COMMAND_CENTER_VISION.md", label: "Command Center — vision" },
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
        title="Build Guide"
        subtitle="Planen bag command center'et og systemets egen dokumentation."
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
