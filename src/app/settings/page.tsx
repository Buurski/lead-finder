import PageHeader from "@/components/shell/PageHeader";
import SettingsClient from "./SettingsClient";
import { readSettings, nextRunLabel } from "@/lib/settings";

export const metadata = { title: "Indstillinger · Command Center" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await readSettings();
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
