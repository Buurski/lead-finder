import { eq } from "drizzle-orm";
import PageHeader from "@/components/shell/PageHeader";
import SettingsClient from "./SettingsClient";
import AccountCard from "./AccountCard";
import { readSettings, nextRunLabel } from "@/lib/settings";
import { appUser } from "@/lib/db/schema";
import { getDb, pgEnabled } from "@/lib/db/client";
import { currentUser } from "@/lib/current-user";

export const metadata = { title: "Indstillinger · Kinly Lead System" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await readSettings();
  const user = await currentUser();

  let profile: { name: string; email: string; hasPassword: boolean } | null = null;
  if ((user === "lucas" || user === "charlie") && pgEnabled()) {
    const [row] = await getDb().select().from(appUser).where(eq(appUser.id, user)).limit(1);
    if (row) profile = { name: row.name, email: row.email, hasPassword: Boolean(row.passwordHash) };
  }

  return (
    <div className="cc-fade kinly-page">
      <PageHeader
        icon="Settings"
        title="Indstillinger"
        subtitle="Din konto og dit login — og motorens kadence nedenfor."
      />
      <div style={{ display: "grid", gap: 24, maxWidth: 640 }}>
        <AccountCard user={user} profile={profile} />
        <div>
          <h2
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--text-dim)",
              margin: "0 0 10px 2px",
            }}
          >
            Automatik
          </h2>
          <SettingsClient initial={settings} initialNextRun={nextRunLabel(settings)} />
        </div>
      </div>
    </div>
  );
}
