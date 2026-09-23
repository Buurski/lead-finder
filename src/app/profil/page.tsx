import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { currentUser } from "@/lib/current-user";
import { listMyDay } from "@/lib/hq/tasks";
import { calendarToken } from "@/lib/hq/calendar";
import { copenhagenNow } from "@/lib/settings";
import CalendarLinks from "@/components/opgaver/CalendarLinks";
import PageHeader from "@/components/shell/PageHeader";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profil · Kinly HQ" };

export default async function ProfilePage() {
  const user = await currentUser();
  const personal = user === "lucas" || user === "charlie" ? user : null;
  const items = await listMyDay(getDb(), { today: copenhagenNow().date, owner: personal ?? undefined });
  const count = items.filter((item) => item.kind === "task").length;
  const secret = process.env.AUTH_SESSION_SECRET;
  const url = personal && secret ? `https://lead-finder-three-beta.vercel.app/api/kalender/${personal}?t=${calendarToken(personal, secret)}` : null;
  return <div className="cc-fade kinly-page">
    <PageHeader icon="Users" title="Profil" subtitle="Din opgavekalender og dit overblik." />
    <div className="cc-card cc-card-pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div><strong>Logget ind som</strong><p>{personal === "lucas" ? "Lucas" : personal === "charlie" ? "Charlie" : user === "delt" ? "Delt login" : "Lokal udvikling"}</p></div>
      <div><strong>{personal ? "Mine opgaver" : "Åbne opgaver"}</strong><p>{count} åbne opgaver · <Link className="cc-link" href="/opgaver">Se opgaver</Link></p></div>
      <div><strong>Kalender</strong>
        {url ? <><CalendarLinks url={url} /><p>Google Kalender → Andre kalendere → +<br />Vælg Fra webadresse, og indsæt linket.<br />Google opdaterer typisk abonnementet ca. hver 8.–12. time.</p></> : <p>Kalenderlink kræver personligt login og opsat sessionnøgle.</p>}
      </div>
    </div>
  </div>;
}
