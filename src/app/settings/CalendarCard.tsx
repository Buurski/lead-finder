import { revalidatePath } from "next/cache";
import CalendarLinks from "@/components/opgaver/CalendarLinks";
import { currentUser } from "@/lib/current-user";
import { getIcsToken, rotateIcsToken } from "@/lib/hq/calendar";
import { readCronLog } from "@/lib/cron-log";

async function newLink() {
  "use server";
  const user = await currentUser();
  if (user !== "lucas" && user !== "charlie") return;
  await rotateIcsToken(user);
  revalidatePath("/settings");
}

// Opgaver med dato som kalenderabonnement (flyttet hertil fra /profil).
export default async function CalendarCard({ user }: { user: string | null }) {
  if (user !== "lucas" && user !== "charlie") return null;
  const base = (process.env.APP_URL || "https://lead-finder-three-beta.vercel.app").replace(/\/$/, "");
  const url = `${base}/api/kalender/${user}?t=${await getIcsToken(user)}`;
  // Service-accountens mail er ikke hemmelig — den skal bare kunne deles til.
  let saEmail = "";
  try {
    saEmail = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}").client_email || "";
  } catch {}
  const connected = !!process.env[`HQ_GCAL_${user.toUpperCase()}`]?.trim();
  const last = (await readCronLog(200).catch(() => [])).filter((e) => e.cron === "calendar-sync").sort((a, b) => b.at.localeCompare(a.at))[0];
  return (
    <div className="cc-card cc-card-pad" style={{ display: "grid", gap: 12 }}>
      <strong>Kalender</strong>
      <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
        <span><strong>Google Kalender med påmindelser</strong> {connected ? "· forbundet" : "· ikke sat op"}</span>
        {connected ? (
          <span className="cc-dim" style={{ fontSize: 12.5 }}>
            Opgaver og næste skridt med dato lægges kl. 8 på dagen med påmindelse kl. 17 dagen før og kl. 8. Forfaldne flyttes til i dag. Synkes hver time
            {last ? ` · sidst ${new Date(last.at).toLocaleString("da-DK", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Copenhagen" })}: ${last.ok ? last.note ?? "ok" : `fejl — ${last.error}`}` : ""}.
          </span>
        ) : (
          <ol className="cc-dim" style={{ fontSize: 12.5, margin: 0, paddingLeft: 18, display: "grid", gap: 3 }}>
            <li>Google Kalender → Andre kalendere → + → Opret ny kalender, fx &quot;Kinly HQ&quot;.</li>
            <li>Kalenderens indstillinger → Del med bestemte personer → tilføj <code>{saEmail || "service-accountens mail"}</code> med &quot;Foretag ændringer i begivenheder&quot;.</li>
            <li>Kopiér &quot;Kalender-id&quot; (under Integrer kalender) og sæt det som <code>{`HQ_GCAL_${user.toUpperCase()}`}</code> i Vercel.</li>
          </ol>
        )}
      </div>
      <span className="cc-dim" style={{ fontSize: 12 }}>Eller abonnér (uden påmindelser):</span>
      <CalendarLinks url={url} />
      <p className="cc-dim" style={{ fontSize: 12.5, margin: 0 }}>
        Google Kalender → Andre kalendere → + → Fra webadresse, og indsæt linket. Google opdaterer abonnementet ca. hver 8.–12. time.
      </p>
      <form action={newLink}>
        <button type="submit" className="cc-btn">Lav nyt link (det gamle holder op med at virke)</button>
      </form>
    </div>
  );
}
