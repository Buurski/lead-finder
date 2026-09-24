import { revalidatePath } from "next/cache";
import CalendarLinks from "@/components/opgaver/CalendarLinks";
import { currentUser } from "@/lib/current-user";
import { getIcsToken, rotateIcsToken } from "@/lib/hq/calendar";

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
  return (
    <div className="cc-card cc-card-pad" style={{ display: "grid", gap: 12 }}>
      <strong>Kalender</strong>
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
