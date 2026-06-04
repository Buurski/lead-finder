import { buildDeckSummary } from "@/lib/deck";
import { readSettings, nextRunLabel } from "@/lib/settings";
import { loadSpendSummary } from "@/lib/spend-log";
import MissionControl from "@/components/mission/MissionControl";

// Mission Control is the home screen. We build the read model on the server so
// the page paints a real, instant value (no client round-trip, no spinner-first).
// buildDeckSummary is offline-safe, so a Sheets outage still renders calm states.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const summary = await buildDeckSummary();
  const cadence = nextRunLabel(await readSettings());
  const spend = await loadSpendSummary();
  const spendAlert = spend.alert ? `AI-forbrug i dag: ${spend.todayDKK.toLocaleString("da-DK", { maximumFractionDigits: 0 })} kr` : null;
  return <MissionControl summary={summary} cadence={cadence} spendAlert={spendAlert} />;
}
