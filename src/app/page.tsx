import { buildDeckSummary } from "@/lib/deck";
import { readSettings, nextRunLabel } from "@/lib/settings";
import { loadSpendSummary } from "@/lib/spend-log";
import { readVaultNote } from "@/lib/vault";
import MissionControl from "@/components/mission/MissionControl";
import type { DailyBrief } from "@/components/mission/MissionControl";

// Mission Control is the home screen. We build the read model on the server so
// the page paints a real, instant value (no client round-trip, no spinner-first).
// buildDeckSummary is offline-safe, so a Sheets outage still renders calm states.
export const dynamic = "force-dynamic";

// Today's brief from the Obsidian vault (daily/<date>.md), read remote-first so
// it reflects what Lucas wrote this morning. Best-effort: a missing note / no
// token just yields ok:false and the hub shows a soft hint instead.
async function loadDailyBrief(): Promise<DailyBrief> {
  const date = new Date().toISOString().slice(0, 10);
  try {
    const note = await readVaultNote(`daily/${date}`, { preferRemote: true });
    if (note.ok && note.body.trim()) {
      return {
        ok: true,
        date,
        title: note.frontmatter.title || `Dagens note · ${date}`,
        body: note.body.trim(),
        source: note.source,
        pathRel: note.pathRel,
      };
    }
  } catch {
    /* ignore — fall through to not-ok */
  }
  return { ok: false, date, title: "", body: "", source: "none", pathRel: `daily/${date}.md` };
}

export default async function HomePage() {
  const [summary, settings, spend, dailyBrief] = await Promise.all([
    buildDeckSummary(),
    readSettings(),
    loadSpendSummary(),
    loadDailyBrief(),
  ]);
  const cadence = nextRunLabel(settings);
  const spendAlert = spend.alert ? `AI-forbrug i dag: ${spend.todayDKK.toLocaleString("da-DK", { maximumFractionDigits: 0 })} kr` : null;
  return <MissionControl summary={summary} cadence={cadence} spendAlert={spendAlert} spend={spend} dailyBrief={dailyBrief} />;
}
