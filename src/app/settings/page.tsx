import PageHeader from "@/components/shell/PageHeader";
import SettingsClient from "./SettingsClient";
import { readSettings, nextRunLabel } from "@/lib/settings";

export const metadata = { title: "Indstillinger · Command Center" };
export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const settings = readSettings();
  return (
    <div className="cc-fade">
      <PageHeader
        icon="Settings"
        title="Indstillinger"
        subtitle="Motor-kadence. Default er slukket — tænd selv når du er tryg."
      />
      <SettingsClient initial={settings} initialNextRun={nextRunLabel(settings)} />
    </div>
  );
}
